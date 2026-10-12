# Nova AI — Chat & Creative Studio

A polished Flask web app that combines fast AI chat with AI image generation in one browser-based workspace. Nova AI uses Groq for text responses and Pollinations' OpenAI-compatible image API for Flux-powered artwork.

## Highlights

- **AI chat** powered by Groq's `openai/gpt-oss-120b` model
- **AI image generation** using the Flux model through Pollinations
- **Three modes:** Auto, Text, and Image
- **Markdown and syntax-highlighted code** in chat responses
- **Image tools:** fullscreen preview, download, and prompt copy
- **Browser-side chat history** with search and session persistence
- **Voice input and text-to-speech** when supported by the browser
- Responsive dark/light interface with a landing page and creative-studio UI

## Tech stack

- Python + Flask
- OpenAI Python SDK (used with Groq and Pollinations-compatible endpoints)
- Vanilla HTML, CSS, and JavaScript
- Web Speech API, `highlight.js`, Font Awesome, and Google Fonts

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/arpan-ghosh-42/Ai-Chatbot.git
cd Ai-Chatbot
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv

# Windows PowerShell
.\venv\Scripts\Activate.ps1

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install flask openai python-dotenv
```

### 4. Add your API keys

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
POLLINATIONS_API_KEY=your_pollinations_api_key
```

> Keep `.env` private. It is excluded from Git so your API keys are never committed.

### 5. Run the app

```bash
python app.py
```

Then open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

## How it works

The frontend sends your prompt to `POST /generate`.

- A normal prompt is sent to Groq and displayed as a text response.
- A prompt containing phrases such as `generate an image`, `create an image`, or `draw an image` is sent to the Flux image endpoint.
- Generated images are saved locally under `static/generated/` and returned to the browser for preview or download.

You can also select **Image** mode in the interface to make image creation explicit.

## Project structure

```text
Ai-Chatbot/
├── app.py                 # Flask routes and AI API integration
├── templates/
│   └── index.html         # Landing page and app interface
├── static/
│   ├── css/style.css      # Responsive visual design
│   ├── js/app.js          # Chat UI, history, voice, and image controls
│   └── generated/         # Runtime-generated images (not committed)
├── .env                   # Local API keys (not committed)
└── .gitignore
```

## API keys

This project requires accounts and valid API keys for:

- [Groq](https://groq.com/) for text generation
- [Pollinations](https://pollinations.ai/) for image generation

The application calls external AI providers, so avoid entering sensitive data in prompts.

## Development notes

- The app currently runs with Flask debug mode enabled for local development.
- Runtime images are ignored by Git; the empty `static/generated/` directory is kept with `.gitkeep`.
- Voice features depend on browser support for the Web Speech API.

## Contributing

Contributions are welcome. For a change, create a branch, make the update, and open a pull request with a clear description.
