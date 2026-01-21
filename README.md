# LexiVision AI - Interactive Visual Dictionary

LexiVision is a cutting-edge visual dictionary application designed to make language learning intuitive and engaging. By leveraging the power of Google's Gemini models, it creates rich definitions, generates unique AI-powered imagery for every word, and provides a real-time conversational practice environment.

## ✨ Features

- **Visual Definitions**: Instant definitions with phonetics, parts of speech, and illustrative examples.
- **AI Image Generation**: Every word search triggers the generation of a unique, high-quality image using Gemini 2.5 Flash Image.
- **Conversational Practice**: Engage in real-time voice conversations with an AI tutor to master word usage in context.
- **Pronunciation Lab**: Get detailed phonetic feedback on your pronunciation from a professional AI linguist.
- **Personal Collections**: Organize your learning by creating custom word lists and collections.
- **Image Editing**: Refine and modify the generated visuals with natural language prompts.
- **Text Overlays**: Add custom text annotations directly onto the word visuals for better memorization.

## 🚀 Getting Started

### Prerequisites

To run this project locally, you will need:

1.  **Node.js**: [Download and install Node.js](https://nodejs.org/) (LTS version recommended).
2.  **Google Gemini API Key**:
    - Go to the [Google AI Studio](https://aistudio.google.com/).
    - Create a new API Key.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/lexivision-ai.git
    cd lexivision-ai
    ```

2.  **Environment Configuration**:
    The application expects your API key to be available via the environment variable `process.env.API_KEY`. 
    
    Create a `.env` file in the root directory:
    ```env
    API_KEY=your_gemini_api_key_here
    ```

3.  **Run the App**:
    Since this project uses modern ES6 modules and a custom import map, you can serve it using any static file server:
    ```bash
    npx serve .
    ```

## 🛠 Tech Stack

- **Framework**: React (v19)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **AI Integration**: Google GenAI SDK (@google/genai)
- **Primary Models**: 
    - `gemini-3-flash-preview` (Text, Definitions, Suggestions)
    - `gemini-2.5-flash-image` (Visual Generation & Editing)
    - `gemini-2.5-flash-native-audio-preview-12-2025` (Real-time Voice/Live API)

## 🎤 Permissions

For the interactive practice features, the application will request access to your:
- **Microphone**: Required for voice conversations and pronunciation analysis.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.