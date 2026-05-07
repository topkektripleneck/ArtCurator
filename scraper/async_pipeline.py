import os
import sys
import json
import asyncio
import pandas as pd
import google.generativeai as genai
from groq import AsyncGroq
from dotenv import load_dotenv
from scraper.utils import (
    get_async_client,
    fetch_wikipedia_extract_async,
    load_processed_movements,
    append_to_csv,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# Ensure logging to stdout works async properly by just using standard print
def log(msg: str):
    print(msg)
    sys.stdout.flush()


async def get_enriched_data_gemini(model: genai.GenerativeModel, prompt: str) -> dict:
    """Sends a prompt to Gemini and returns parsed JSON."""
    response = await model.generate_content_async(
        prompt, generation_config={"response_mime_type": "application/json"}
    )
    return json.loads(response.text)


async def get_enriched_data_groq(client: AsyncGroq, prompt: str) -> dict:
    """Sends a prompt to Groq and returns parsed JSON."""
    chat_completion = await client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
    )
    return json.loads(chat_completion.choices[0].message.content)


async def get_enriched_data_with_retry(
    movement, extract_text, valid_movements_str, gemini_model, groq_client
):
    prompt = f"""Analyze '{movement}' and provide structured JSON data.

CONTEXT:
{extract_text}

VALID MOVEMENTS:
{valid_movements_str}

OUTPUT:
{{
  "summary": "300-500 word essay",
  "era": "e.g. 1860\u20131880",
  "relationships": [{{"target": "Valid Movement Name", "type": "influenced_by/influenced/etc", "context": "..."}}]
}}
"""
    max_retries = 3
    base_delay = 5

    # Try Gemini first, then fallback to Groq if Gemini fails after retries
    for ai_provider, method, args in [
        ("Gemini", get_enriched_data_gemini, (gemini_model, prompt)),
        ("Groq", get_enriched_data_groq, (groq_client, prompt)),
    ]:
        for attempt in range(max_retries):
            try:
                data = await method(*args)
                return data, ai_provider
            except Exception as e:
                err_str = str(e)
                if (
                    "429" in err_str
                    or "Too Many Requests" in err_str
                    or "Resource has been exhausted" in err_str
                ):
                    delay = base_delay * (2**attempt)
                    log(
                        f"  [{movement}] {ai_provider} Rate limit (429). Retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                else:
                    log(f"  [{movement}] {ai_provider} Error: {err_str[:100]}")
                    break  # Break inner retry loop on non-429 errors, try next provider

    return {"error": "All AI providers failed."}, "None"


async def process_movement(
    movement,
    valid_movements_str,
    gemini_model,
    groq_client,
    http_client,
    semaphore,
    write_queue,
):
    async with semaphore:
        log(f"Processing: {movement}")
        extract = (
            await fetch_wikipedia_extract_async(movement, http_client)
            or "No context available."
        )

        data, provider = await get_enriched_data_with_retry(
            movement, extract, valid_movements_str, gemini_model, groq_client
        )

        if "error" not in data:
            record = {
                "name": movement,
                "era": data.get("era", "Unknown"),
                "summary": data.get("summary", ""),
                "relationships": json.dumps(data.get("relationships", [])),
            }
            # Send to writer queue
            await write_queue.put(record)
            log(f"  [{movement}] Done. (via {provider})")
        else:
            log(f"  [{movement}] SKIPPING due to error.")


async def csv_writer_task(write_queue, output_csv):
    """Background task to strictly handle writing to CSV to prevent collisions."""
    while True:
        record = await write_queue.get()
        if record is None:  # Sentinel value to stop
            write_queue.task_done()
            break

        append_to_csv(output_csv, record)
        write_queue.task_done()


async def run_async_pipeline():
    load_dotenv()
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))

    gemini_model = genai.GenerativeModel("gemini-2.0-flash")

    registry_csv = "art_movements_registry_final_clean.csv"
    output_csv = "art_movements_master.csv"

    if not os.path.exists(registry_csv):
        log(f"Error: {registry_csv} not found.")
        return

    # Load movements
    df_reg = pd.read_csv(registry_csv)
    name_col = "Name" if "Name" in df_reg.columns else "Movement"
    all_movements = sorted(df_reg[name_col].dropna().unique().tolist())
    valid_movements_str = "\n".join(all_movements)

    processed_movements = load_processed_movements(output_csv)
    movements_to_process = [m for m in all_movements if m not in processed_movements]
    log(f"Resuming: {len(processed_movements)} done, {len(movements_to_process)} left.")

    if not movements_to_process:
        log("No movements to process.")
        return

    # Concurrency limit setup
    CONCURRENT_REQUESTS = 5  # Conservative to avoid immediate 429
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    write_queue = asyncio.Queue()

    # Start the writer task
    writer_future = asyncio.create_task(csv_writer_task(write_queue, output_csv))

    # We use a single shared httpx client for Wikipedia requests to pool connections
    async with get_async_client() as http_client:
        tasks = [
            asyncio.create_task(
                process_movement(
                    movement,
                    valid_movements_str,
                    gemini_model,
                    groq_client,
                    http_client,
                    semaphore,
                    write_queue,
                )
            )
            for movement in movements_to_process
        ]

        # Wait for all processing tasks to complete
        await asyncio.gather(*tasks)

    # Wait for the queue to be fully written
    await write_queue.join()
    # Stop the writer task
    await write_queue.put(None)
    await writer_future

    log("Async pipeline completed successfully.")


if __name__ == "__main__":
    asyncio.run(run_async_pipeline())
