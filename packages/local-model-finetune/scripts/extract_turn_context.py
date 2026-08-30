#!/usr/bin/env python3
import argparse
import json
import re
import sys

from mlx_lm import generate, load


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--adapter-path", required=True)
    parser.add_argument("--max-tokens", type=int, default=320)
    parser.add_argument("--serve", action="store_true")
    return parser.parse_args()


def build_messages(payload):
    system = "\n".join(
        [
            "You are the user's private local self-model for turn personalization.",
            "Read the current user message together with the current self-model context.",
            "Produce exactly 3 short personalization hints for a stronger online model.",
            "Each hint must begin with: Hint: ",
            "Do not answer the user directly.",
            "Do not predict fate or use mystical language.",
            "Prefer practical fit signals such as pace, pressure tolerance, relationship sensitivity, money urgency, autonomy needs, and recovery style.",
            "Treat identity-sensitive conclusions as hypotheses.",
            "Keep hints short, grounded, and useful for only this turn.",
            "No markdown.",
        ]
    )
    user = "\n".join(
        [
            "Input payload:",
            json.dumps(payload, ensure_ascii=False, indent=2),
        ]
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def extract_hints(text: str):
    json_marker = text.rfind('{"turnContextHints"')
    if json_marker >= 0:
        try:
            parsed = json.JSONDecoder().raw_decode(text[json_marker:])[0]
            hints = parsed.get("turnContextHints", [])
            if isinstance(hints, list):
                return [str(hint).strip() for hint in hints if str(hint).strip()]
        except Exception:
            pass

    matches = re.findall(r'Hint:\s*([^"\n]+)', text)
    cleaned = []
    for match in matches:
        hint = match.strip(" .,\t\r\n'”")
        if hint and hint not in cleaned:
            cleaned.append(hint)

    return cleaned[:6]


def personalize(model, tokenizer, payload, max_tokens):
    messages = build_messages(payload)
    prompt = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    ) + "Hint: "
    output = generate(
        model,
        tokenizer,
        prompt,
        verbose=False,
        max_tokens=max_tokens,
    )
    hints = extract_hints(output)
    return {
        "turnContextHints": hints,
        "notes": ["parsed_from_local_model_output"] if hints else ["no_hints_parsed"],
    }


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def serve(args, model, tokenizer):
    emit({"type": "ready"})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            command = request.get("command")
            if command == "ping":
                emit({"id": request_id, "ok": True, "result": {"status": "ready"}})
                continue
            if command != "personalize":
                raise ValueError(f"Unsupported worker command: {command}")

            result = personalize(
                model,
                tokenizer,
                request.get("payload") or {},
                args.max_tokens,
            )
            emit({"id": request_id, "ok": True, "result": result})
        except Exception as error:
            emit({"id": request_id, "ok": False, "error": str(error)})


def main():
    args = parse_args()
    model, tokenizer = load(args.model, adapter_path=args.adapter_path)
    if args.serve:
        serve(args, model, tokenizer)
        return

    payload = json.load(sys.stdin)
    emit(personalize(model, tokenizer, payload, args.max_tokens))


if __name__ == "__main__":
    main()
