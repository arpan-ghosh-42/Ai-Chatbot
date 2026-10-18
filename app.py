from flask import Flask, render_template, request, jsonify, url_for
from openai import OpenAI
from dotenv import load_dotenv
import os
import base64
import uuid
from pathlib import Path

load_dotenv()


app = Flask(__name__)
#.\venv\Scripts\python.exe app.py

# Generated images must live in Flask's project-level static directory, not
# inside templates/.  Creating the folder here also makes a clean checkout and
# a deployed app work without any manual folder setup.
GENERATED_IMAGES_DIR = Path(app.static_folder) / "generated"

TEXT_MODEL = "openai/gpt-oss-120b"

# Multi-turn context sent with each chat request
MAX_HISTORY_TURNS = 8
MAX_HISTORY_CHARS = 6000

# Words that indicate image generation in 'auto' mode.  The last four match
# the frontend's own detection so the loading indicator and result agree.
IMAGE_WORDS = [
    "generate an image",
    "create an image",
    "make an image",
    "generate a picture",
    "create a picture",
    "make a picture",
    "draw an image",
    "draw a picture",
    "/image",
    "paint a",
    "photo of",
    "image of",
]

# Prompt suffixes for the image style presets in the UI
IMAGE_STYLES = {
    "photorealistic": "photorealistic, 8K, ultra-detailed, natural lighting",
    "cyberpunk": "cyberpunk style, neon lights, futuristic, high contrast",
    "anime": "anime / manga style, clean line art, vibrant colors",
    "cinematic": "cinematic film still, dramatic lighting, shallow depth of field",
    "digital-art": "digital concept art, highly detailed, artstation quality",
    "fantasy": "epic fantasy art, mythic, magical atmosphere",
    "watercolor": "watercolor painting, soft washes, textured paper",
}

# -----------------------------
# GROQ CLIENT
# -----------------------------

# The OpenAI SDK raises at import time when a key is missing, which crashes the
# whole app with a confusing traceback.  Use a placeholder instead and report a
# clear message from the routes that need the key.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
POLLINATIONS_API_KEY = os.getenv("POLLINATIONS_API_KEY")

for _name, _key in (("GROQ_API_KEY", GROQ_API_KEY), ("POLLINATIONS_API_KEY", POLLINATIONS_API_KEY)):
    if not _key:
        print(f"WARNING: {_name} is not set. Add it to your .env file.")

groq_client = OpenAI(
    api_key=GROQ_API_KEY or "missing-key",
    base_url="https://api.groq.com/openai/v1"
)

# -----------------------------
# POLLINATIONS CLIENT
# -----------------------------

image_client = OpenAI(
    api_key=POLLINATIONS_API_KEY or "missing-key",
    base_url="https://gen.pollinations.ai/v1"
)


def missing_key_response(name):
    return jsonify({
        "error": f"{name} is missing. Add it to the .env file in the project folder and restart the server."
    }), 503


# -----------------------------
# HOME PAGE
# -----------------------------

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/status")
def status():
    return jsonify({"ok": True})


# -----------------------------
# AI GENERATION
# -----------------------------

def build_chat_history(raw_messages, prompt):
    """Turn the frontend's recent messages into a clean user/assistant list ending with the prompt."""
    history = []
    if isinstance(raw_messages, list):
        for message in raw_messages[-MAX_HISTORY_TURNS:]:
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            content = message.get("content")
            if role not in ("user", "assistant") or not isinstance(content, str) or not content.strip():
                continue
            # Skip error bubbles the frontend stores as assistant messages
            if role == "assistant" and content.startswith("⚠️"):
                continue
            history.append({"role": role, "content": content[:MAX_HISTORY_CHARS]})

    if not history or history[-1]["role"] != "user" or history[-1]["content"].strip() != prompt:
        history.append({"role": "user", "content": prompt})
    return history


def build_image_prompt(prompt, style):
    style = (style or "").strip().lower()
    if not style or style == "default":
        return prompt
    suffix = IMAGE_STYLES.get(style, f"{style[:60]} style")
    return f"{prompt}, {suffix}"


@app.route("/generate", methods=["POST"])
def generate():

    data = request.get_json(silent=True) or {}

    prompt = str(data.get("prompt", "")).strip()

    if not prompt:
        return jsonify({
            "error": "Please enter a prompt."
        }), 400

    mode = data.get("mode", "auto")
    if mode not in ("auto", "text", "image"):
        mode = "auto"

    if mode == "auto":
        is_image_request = any(
            word in prompt.lower()
            for word in IMAGE_WORDS
        )
    else:
        is_image_request = mode == "image"

    # -----------------------------
    # IMAGE GENERATION
    # -----------------------------

    if is_image_request:

        if not POLLINATIONS_API_KEY:
            return missing_key_response("POLLINATIONS_API_KEY")

        image_prompt = build_image_prompt(prompt, data.get("style"))

        try:

            result = image_client.images.generate(
                model="flux",
                prompt=image_prompt
            )

            image_base64 = result.data[0].b64_json

            image_bytes = base64.b64decode(image_base64)

            filename = f"{uuid.uuid4()}.png"

            GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            filepath = GENERATED_IMAGES_DIR / filename

            with open(filepath, "wb") as f:
                f.write(image_bytes)

            return jsonify({
                "type": "image",
                "result": url_for("static", filename=f"generated/{filename}"),
                "prompt": image_prompt
            })

        except Exception as e:

            return jsonify({
                "error": str(e)
            }), 500

    # -----------------------------
    # TEXT GENERATION
    # -----------------------------

    else:

        if not GROQ_API_KEY:
            return missing_key_response("GROQ_API_KEY")

        try:

            response = groq_client.responses.create(
                model=TEXT_MODEL,
                input=build_chat_history(data.get("messages"), prompt)
            )

            return jsonify({
                "type": "text",
                "result": response.output_text
            })

        except Exception as e:

            return jsonify({
                "error": str(e)
            }), 500


# -----------------------------
# RUN SERVER
# -----------------------------

if __name__ == "__main__":
    app.run(debug=True)
