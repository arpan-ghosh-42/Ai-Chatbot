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

# -----------------------------
# GROQ CLIENT
# -----------------------------

groq_client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

# -----------------------------
# POLLINATIONS CLIENT
# -----------------------------

image_client = OpenAI(
    api_key=os.getenv("POLLINATIONS_API_KEY"),
    base_url="https://gen.pollinations.ai/v1"
)


# -----------------------------
# HOME PAGE
# -----------------------------

@app.route("/")
def home():
    return render_template("index.html")


# -----------------------------
# AI GENERATION
# -----------------------------

@app.route("/generate", methods=["POST"])
def generate():

    data = request.get_json()

    prompt = data.get("prompt", "").strip()

    if not prompt:
        return jsonify({
            "error": "Please enter a prompt."
        }), 400

    # Words that indicate image generation
    image_words = [
        "generate an image",
        "create an image",
        "make an image",
        "generate a picture",
        "create a picture",
        "make a picture",
        "draw an image",
        "draw a picture"
    ]

    is_image_request = any(
        word in prompt.lower()
        for word in image_words
    )

    # -----------------------------
    # IMAGE GENERATION
    # -----------------------------

    if is_image_request:

        try:

            result = image_client.images.generate(
                model="flux",
                prompt=prompt
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
                "result": url_for("static", filename=f"generated/{filename}")
            })

        except Exception as e:

            return jsonify({
                "error": str(e)
            }), 500

    # -----------------------------
    # TEXT GENERATION
    # -----------------------------

    else:

        try:

            response = groq_client.responses.create(
                model="openai/gpt-oss-120b",
                input=prompt
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
