import os
import sys
import json
import sqlite3
import tempfile
import hashlib
import time
import glob
import genanki
import anthropic
import httpx
from dotenv import load_dotenv
from flask import Flask, jsonify, send_file, request, after_this_request, Response, stream_with_context
from flask_cors import CORS
from google.cloud import texttospeech
from pypinyin import lazy_pinyin, Style

load_dotenv()

app = Flask(__name__)
CORS(app)

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
DB_PATH = os.path.join(DATA_DIR, "words.db")
MEDIA_DIR = os.path.join(DATA_DIR, "media")

MODEL_ID = 1607392319

CARD_CSS = """\
hr {
  height: 3px;
  background: white;
  border: none;
  margin-top: 20px;
  margin-bottom: 20px;
}
div {
  margin-bottom: 10px;
}
.card {
  font-family: Georgia;
  font-size: 10px;
  text-align: left;
  background-color: rgb(47, 47, 49);
  color: #fff;
  padding: 20px;
}
.hanzi {
  font-family: Kai;
  font-size: 78px;
  border-bottom: 3px solid rgba(0, 0, 0, 0);
  transition: border 0.5s ease, padding 0.5s ease;
  margin-top: 20px;
}
.hanzi.whover {
  cursor: pointer;
}
.hanzi.whover::before {
  font-family: Palatino;
  content: var(--pinyin);
  position: absolute;
  font-size: 22px;
  color: #55DD55;
  padding-left: 10px;
  padding-right: 10px;
  padding-bottom: 5px;
  border-left: 3px solid white;
  transform: translate(-10px, -40px);
  opacity: 0;
  transition: opacity 0.5s ease;
  height: 140px;
  padding-top: 0px;
}
.hanzi.whover:hover::before {
  opacity: 1;
}
.pinyin {
  font-family: Palatino;
  font-size: 22px;
  color: #55DD55;
}
.english {
  font-family: Didot;
  font-size: 16px;
}
.description {
  font-family: Didot;
  font-size: 16px;
  color: #575757;
}
.sentence {
  font-family: Kai;
  font-size: 30px;
  text-align: left;
  transition: padding 0.5s ease;
}
.pinyinSen {
  font-family: Palatino;
  font-size: 20px;
  color: #55DD55;
  text-align: left;
}
.pinyinSen.whover {
  cursor: pointer;
  border-left: 3px solid white;
  padding-left: 10px;
  height: 25px;
  max-height: 80px;
  display: flex;
  padding-top: 55px;
  transform: translate(-10px, -50px);
  opacity: 0;
  transition: opacity 0.5s ease;
  white-space: nowrap;
}
.pinyinSen.whover:hover {
  opacity: 1;
}
.meaningSent {
  font-family: Didot;
  font-size: 16px;
  text-align: left;
}
.stub {
  font-family: Didot;
  font-size: 14px;
  color: #575757;
  font-style: italic;
}
.image {
  margin-top: 20px;
  border-left: 3px solid white;
  padding-left: 10px;
}
"""

# Sentence block used in both templates (conditionally rendered)
SENTENCE_BLOCK_FRONT = (
    "{{#SentenceSimplified}}"
    '<div lang="zh-Hans" class="sentence">{{SentenceSimplified}}</div>'
    '<div class="pinyinSen whover">{{SentencePinyin}}'
    "{{#SentenceSandhi}}<br>Sandhi: {{SentenceSandhi}}{{/SentenceSandhi}}"
    "</div>"
    "{{/SentenceSimplified}}"
    "{{^SentenceSimplified}}"
    '<div class="stub">(example sentence coming soon)</div>'
    "{{/SentenceSimplified}}"
)

SENTENCE_BLOCK_BACK = (
    "{{#SentenceSimplified}}"
    '<div lang="zh-Hans" class="sentence">{{SentenceSimplified}}</div>'
    '<div class="pinyinSen">{{SentencePinyin}}'
    "{{#SentenceSandhi}}<br>Sandhi: {{SentenceSandhi}}{{/SentenceSandhi}}"
    "</div>"
    '<div class="meaningSent">{{SentenceMeaning}}</div>'
    "{{/SentenceSimplified}}"
    "{{^SentenceSimplified}}"
    '<div class="stub">(example sentence coming soon)</div>'
    "{{/SentenceSimplified}}"
    "<br>"
    "{{#Audio}}{{Audio}}{{/Audio}}"
    "{{#SentenceAudio}} {{SentenceAudio}}{{/SentenceAudio}}"
    "<br>"
    '{{#SentenceImage}}<div class="image">{{SentenceImage}}</div>{{/SentenceImage}}'
)

HSK_FIELDS = [
    {"name": "Character"},
    {"name": "Pinyin"},
    {"name": "Meaning"},
    {"name": "HSKLevel"},
    {"name": "PartOfSpeech"},
    {"name": "Audio"},
    {"name": "SentenceSimplified"},
    {"name": "SentencePinyin"},
    {"name": "SentenceSandhi"},
    {"name": "SentenceMeaning"},
    {"name": "SentenceAudio"},
    {"name": "SentenceImage"},
]

ALL_TEMPLATES = {
    "pinyin-meaning": {
        "name": "Pinyin \u2192 Meaning",
        "qfmt": (
            '<div class="pinyin">{{Pinyin}}</div>'
            "{{#PartOfSpeech}}"
            '<div class="description">{{PartOfSpeech}}</div>'
            "{{/PartOfSpeech}}"
            "<hr>"
            + SENTENCE_BLOCK_FRONT
        ),
        "afmt": (
            '<div lang="zh-Hans" class="hanzi">{{Character}}</div>'
            '<div class="pinyin">{{Pinyin}}</div>'
            '<div class="english">{{Meaning}}</div>'
            "{{#PartOfSpeech}}"
            '<div class="description">{{PartOfSpeech}}</div>'
            "{{/PartOfSpeech}}"
            "<hr>"
            + SENTENCE_BLOCK_BACK
        ),
    },
    "character-meaning": {
        "name": "Character \u2192 Meaning",
        "qfmt": (
            '<div lang="zh-Hans" class="hanzi whover" style="--pinyin: \'{{Pinyin}}\'">{{Character}}</div>'
            '<div class="pinyin"><br></div>'
            '<div class="english"><br></div>'
            '<div class="description"><br></div>'
            "<hr>"
            + SENTENCE_BLOCK_FRONT
        ),
        "afmt": (
            '<div lang="zh-Hans" class="hanzi">{{Character}}</div>'
            '<div class="pinyin">{{Pinyin}}</div>'
            '<div class="english">{{Meaning}}</div>'
            "{{#PartOfSpeech}}"
            '<div class="description">{{PartOfSpeech}}</div>'
            "{{/PartOfSpeech}}"
            "<hr>"
            + SENTENCE_BLOCK_BACK
        ),
    },
    "meaning-character": {
        "name": "Meaning \u2192 Character (Pinyin)",
        "qfmt": (
            '<div class="english">{{Meaning}}</div>'
            "{{#PartOfSpeech}}"
            '<div class="description">{{PartOfSpeech}}</div>'
            "{{/PartOfSpeech}}"
        ),
        "afmt": (
            '<div lang="zh-Hans" class="hanzi">{{Character}}</div>'
            '<div class="pinyin">{{Pinyin}}</div>'
            '<div class="english">{{Meaning}}</div>'
            "{{#PartOfSpeech}}"
            '<div class="description">{{PartOfSpeech}}</div>'
            "{{/PartOfSpeech}}"
            "<hr>"
            + SENTENCE_BLOCK_BACK
        ),
    },
}


def build_model(template_ids=None):
    if template_ids is None:
        template_ids = list(ALL_TEMPLATES.keys())
    templates = [ALL_TEMPLATES[tid] for tid in template_ids if tid in ALL_TEMPLATES]
    if not templates:
        templates = list(ALL_TEMPLATES.values())
    return genanki.Model(
        MODEL_ID,
        "HSK Vocabulary",
        fields=HSK_FIELDS,
        templates=templates,
        css=CARD_CSS,
    )

DECK_ID = 2059400110


def stable_guid(word_id: str, mode: str) -> str:
    """Generate a stable GUID from word_id and mode so reimport preserves progress."""
    h = hashlib.sha256(f"{word_id}:{mode}".encode()).hexdigest()
    return h[:10]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


CLAUDE_MODEL = "claude-sonnet-4-20250514"
BATCH_SIZE = 20
TTS_VOICE = "cmn-CN-Wavenet-C"
TTS_SPEAKING_RATE_WORD = 0.70
TTS_SPEAKING_RATE_SENTENCE = 0.65
SD_ENGINE = "sd3.5-medium"


def load_words():
    conn = get_db()
    rows = conn.execute(
        "SELECT simplified, pinyin, meaning, COALESCE(hsk_level_v3, hsk_level_v2) AS hsk_level FROM words WHERE hsk_level_v2 IS NOT NULL OR hsk_level_v3 IS NOT NULL OR source = 'custom'"
    ).fetchall()
    conn.close()

    words = {}
    for row in rows:
        word_id = row["simplified"]
        words[word_id] = {
            "id": word_id,
            "character": word_id,
            "pinyin": row["pinyin"],
            "meaning": row["meaning"],
            "hsk_level": row["hsk_level"],
        }
    return words


def load_word_index():
    conn = get_db()
    rows = conn.execute("SELECT * FROM word_cards").fetchall()
    conn.close()

    index = {}
    for row in rows:
        index[row["simplified"]] = {
            "simplified": row["simplified"],
            "pinyin": row["pinyin"] or "",
            "meaning": row["meaning"] or "",
            "partOfSpeech": row["part_of_speech"] or "",
            "audio": row["audio"] or "",
            "sentence": row["sentence"] or "",
            "sentencePinyin": row["sentence_pinyin"] or "",
            "sentenceMeaning": row["sentence_meaning"] or "",
            "sentenceAudio": row["sentence_audio"] or "",
            "sentenceImage": row["sentence_image"] or "",
            "source": row["card_source"] or "",
        }
    return index


@app.route("/export-anki", methods=["POST"])
def export_anki():
    try:
        body = request.get_json(silent=True) or {}
        template_ids = body.get("templates")
        tracked_ids = body.get("trackedWords", [])

        model = build_model(template_ids)

        all_words = load_words()
        tracked_words = [all_words[wid] for wid in tracked_ids if wid in all_words]

        if not tracked_words:
            return jsonify({"error": "No tracked words to export"}), 400

        word_index = load_word_index()
        deck = genanki.Deck(DECK_ID, "HSK Vocabulary")
        media_files = []

        for word in tracked_words:
            idx = word_index.get(word["character"], {})

            audio = f'[sound:{idx["audio"]}]' if idx.get("audio") else ""
            sen_audio = f'[sound:{idx["sentenceAudio"]}]' if idx.get("sentenceAudio") else ""
            sen_image = f'<img src="{idx["sentenceImage"]}">' if idx.get("sentenceImage") else ""

            # Collect media files
            for f_name in [idx.get("audio"), idx.get("sentenceAudio"), idx.get("sentenceImage")]:
                if f_name:
                    f_path = os.path.join(MEDIA_DIR, f_name)
                    if os.path.exists(f_path) and f_path not in media_files:
                        media_files.append(f_path)

            raw_pinyin = idx.get("sentencePinyin", "")
            if "Sandhi:" in raw_pinyin:
                parts = raw_pinyin.split("Sandhi:", 1)
                sen_pinyin = parts[0].strip()
                sen_sandhi = parts[1].strip()
            else:
                sen_pinyin = raw_pinyin
                sen_sandhi = ""

            note = genanki.Note(
                model=model,
                fields=[
                    word["character"],
                    word["pinyin"],
                    word["meaning"],
                    str(word["hsk_level"]),
                    idx.get("partOfSpeech", ""),
                    audio,
                    idx.get("sentence", ""),
                    sen_pinyin,
                    sen_sandhi,
                    idx.get("sentenceMeaning", ""),
                    sen_audio,
                    sen_image,
                ],
                guid=stable_guid(word["id"], "hsk"),
            )
            deck.add_note(note)

        pkg = genanki.Package(deck)
        pkg.media_files = media_files
        tmp = tempfile.NamedTemporaryFile(suffix=".apkg", delete=False)
        tmp.close()
        pkg.write_to_file(tmp.name)

        @after_this_request
        def cleanup(response):
            try:
                os.remove(tmp.name)
            except OSError:
                pass
            return response

        return send_file(
            tmp.name,
            as_attachment=True,
            download_name="hsk-vocabulary.apkg",
            mimetype="application/octet-stream",
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def get_sandhi_pinyin(text):
    syllables = lazy_pinyin(text, style=Style.TONE, tone_sandhi=True)
    return " ".join(syllables)


def get_dictionary_pinyin(text):
    syllables = lazy_pinyin(text, style=Style.TONE)
    return " ".join(syllables)


def media_filename(word, suffix, ext):
    h = hashlib.sha256(f"{word}:{suffix}".encode()).hexdigest()[:12]
    return f"gen_{h}.{ext}"


def generate_sentences_batch(client, words):
    word_list = "\n".join(
        f"- {w['simplified']} ({w['pinyin']}): {w['meaning']}"
        for w in words
    )
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": f"""Generate one natural example sentence for each Chinese word below.
Each sentence should be simple, practical, and appropriate for the word's HSK level.
Use the word naturally in context. Aim for 6-15 characters per sentence.

For each word, provide:
1. sentence: The example sentence in simplified Chinese
2. sentenceMeaning: English translation of the sentence
3. imagePrompt: A short visual description for illustration (10-20 words, no text/words in image). Focus on the WORD's core meaning rather than the sentence — e.g. for "tree" just show a tree, for "Arabic" show Arabic calligraphy or symbols, for "happy" show a smiling face. Keep it iconic and simple.

Return ONLY a JSON array with objects having keys: simplified, sentence, sentenceMeaning, imagePrompt

Words:
{word_list}"""
        }],
    )
    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    return json.loads(text.strip())


def generate_audio(tts_client, text, speaking_rate):
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code="cmn-CN",
        name=TTS_VOICE,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=speaking_rate,
    )
    response = tts_client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )
    return response.audio_content


def generate_image(api_key, prompt):
    url = "https://api.stability.ai/v2beta/stable-image/generate/sd3"
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "image/*",
            },
            files={"none": ""},
            data={
                "prompt": f"Simple flat illustration, clean modern style, no text or words: {prompt}",
                "model": SD_ENGINE,
                "output_format": "jpeg",
                "aspect_ratio": "5:4",
            },
        )
        if response.status_code == 200:
            return response.content
        else:
            print(f"  Image generation failed ({response.status_code}): {response.text}", file=sys.stderr)
            return None


def upsert_word_card(conn, entry):
    conn.execute(
        """INSERT INTO word_cards (simplified, pinyin, meaning, part_of_speech, audio, sentence, sentence_pinyin, sentence_meaning, sentence_audio, sentence_image, card_source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(simplified) DO UPDATE SET
             pinyin=excluded.pinyin, meaning=excluded.meaning, part_of_speech=excluded.part_of_speech,
             audio=excluded.audio, sentence=excluded.sentence, sentence_pinyin=excluded.sentence_pinyin,
             sentence_meaning=excluded.sentence_meaning, sentence_audio=excluded.sentence_audio,
             sentence_image=excluded.sentence_image, card_source=excluded.card_source""",
        (
            entry["simplified"], entry["pinyin"], entry["meaning"],
            entry["partOfSpeech"], entry["audio"], entry["sentence"],
            entry["sentencePinyin"], entry["sentenceMeaning"],
            entry["sentenceAudio"], entry["sentenceImage"], entry["source"],
        ),
    )
    conn.commit()


@app.route("/generate-cards", methods=["POST"])
def generate_cards():
    body = request.get_json(silent=True) or {}
    words = body.get("words", [])
    if not words:
        return jsonify({"error": "No words provided"}), 400

    for var in ["ANTHROPIC_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "STABILITY_API_KEY"]:
        if not os.environ.get(var):
            return jsonify({"error": f"Server missing env var: {var}"}), 500

    def event_stream():
        total = len(words)
        done = 0
        claude_client = anthropic.Anthropic()
        tts_client = texttospeech.TextToSpeechClient()
        stability_key = os.environ["STABILITY_API_KEY"]
        conn = get_db()

        try:
            for batch_start in range(0, total, BATCH_SIZE):
                batch = words[batch_start:batch_start + BATCH_SIZE]

                try:
                    sentences = generate_sentences_batch(claude_client, batch)
                except Exception as e:
                    yield f"data: {json.dumps({'error': f'Claude API error: {str(e)}'})}\n\n"
                    return
                sentence_map = {s["simplified"]: s for s in sentences}

                for word in batch:
                    char = word["simplified"]
                    sent_data = sentence_map.get(char)
                    if not sent_data:
                        done += 1
                        yield f"data: {json.dumps({'done': done, 'total': total, 'current': char, 'skipped': True})}\n\n"
                        continue

                    sentence = sent_data["sentence"]
                    sentence_meaning = sent_data["sentenceMeaning"]
                    image_prompt = sent_data["imagePrompt"]

                    sentence_pinyin_dict = get_dictionary_pinyin(sentence)
                    sentence_pinyin_sandhi = get_sandhi_pinyin(sentence)
                    if sentence_pinyin_dict:
                        sentence_pinyin_dict = sentence_pinyin_dict[0].upper() + sentence_pinyin_dict[1:]
                    if sentence_pinyin_sandhi:
                        sentence_pinyin_sandhi = sentence_pinyin_sandhi[0].upper() + sentence_pinyin_sandhi[1:]

                    if sentence_pinyin_dict != sentence_pinyin_sandhi:
                        sentence_pinyin = f"{sentence_pinyin_dict} Sandhi: {sentence_pinyin_sandhi}"
                    else:
                        sentence_pinyin = sentence_pinyin_dict

                    try:
                        word_audio_bytes = generate_audio(tts_client, char, TTS_SPEAKING_RATE_WORD)
                        sentence_audio_bytes = generate_audio(tts_client, sentence, TTS_SPEAKING_RATE_SENTENCE)
                    except Exception as e:
                        done += 1
                        yield f"data: {json.dumps({'done': done, 'total': total, 'current': char, 'error': f'TTS error: {str(e)}'})}\n\n"
                        continue

                    word_audio_file = media_filename(char, "word", "mp3")
                    sentence_audio_file = media_filename(char, "sentence", "mp3")
                    os.makedirs(MEDIA_DIR, exist_ok=True)
                    with open(os.path.join(MEDIA_DIR, word_audio_file), "wb") as f:
                        f.write(word_audio_bytes)
                    with open(os.path.join(MEDIA_DIR, sentence_audio_file), "wb") as f:
                        f.write(sentence_audio_bytes)

                    image_file = ""
                    try:
                        image_bytes = generate_image(stability_key, image_prompt)
                        if image_bytes:
                            image_file = media_filename(char, "image", "jpg")
                            with open(os.path.join(MEDIA_DIR, image_file), "wb") as f:
                                f.write(image_bytes)
                    except Exception:
                        pass

                    entry = {
                        "simplified": char,
                        "pinyin": word.get("pinyin", ""),
                        "meaning": word.get("meaning", ""),
                        "partOfSpeech": word.get("partOfSpeech", ""),
                        "audio": word_audio_file,
                        "sentence": sentence,
                        "sentencePinyin": sentence_pinyin,
                        "sentenceMeaning": sentence_meaning,
                        "sentenceAudio": sentence_audio_file,
                        "sentenceImage": image_file,
                        "source": "generated",
                    }
                    upsert_word_card(conn, entry)

                    done += 1
                    yield f"data: {json.dumps({'done': done, 'total': total, 'current': char})}\n\n"
                    time.sleep(0.3)
        finally:
            conn.close()

        yield f"data: {json.dumps({'complete': True, 'generated': done})}\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
