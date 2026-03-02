"""
i18n Translator Backend – FastAPI
"""
import json, os, re, shutil, zipfile, io, datetime
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Any

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR  = Path(__file__).parent.parent
DATA_DIR  = BASE_DIR / "data" / "1.0.0"
BACKUP_DIR = BASE_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

B_API_BASE  = "https://b-api.staging.openeduhub.net/api/v1/llm/openai"
B_API_MODEL = os.getenv("B_API_MODEL", "gpt-4.1-mini")
CONFIG_FILE = BASE_DIR / "config.json"

def load_config() -> Dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_config(cfg: Dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

def get_api_key() -> str:
    env_key = os.getenv("B_API_KEY", "")
    if env_key:
        return env_key
    return load_config().get("b_api_key", "")

app = FastAPI(title="i18n Translator API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Pydantic models ───────────────────────────────────────────────────────────
class SaveJsonPayload(BaseModel):
    category: str
    lang: str
    flat: Dict[str, str]

class SaveMailPayload(BaseModel):
    lang: str          # e.g. "de_DE" or "default"
    templates: Dict[str, Dict[str, str]]  # name -> {subject?, message}

class SaveMdsPayload(BaseModel):
    group: str
    lang: str
    translations: Dict[str, str]

class AiTranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str
    context: Optional[str] = None

class ConfigPayload(BaseModel):
    b_api_key: Optional[str] = None
    custom_areas: Optional[List[Dict]] = None
    lang_descriptions: Optional[Dict[str, str]] = None
    excluded_mds_groups: Optional[List[str]] = None
    excluded_json_categories: Optional[List[str]] = None
    variant_filters: Optional[Dict[str, str]] = None

class AddLanguageRequest(BaseModel):
    area: str
    lang: str
    base_on: Optional[str] = None
    description: Optional[str] = None   # e.g. "Informal German, use 'du' form"

class AiFillRequest(BaseModel):
    area: str          # json | mds
    id: str            # category or group name
    target_lang: str
    ref_lang: str = "de"

class AiReviewRequest(BaseModel):
    area: str
    id: str
    target_lang: str
    ref_lang: str = "de"
    max_keys: int = 20

# ── Helpers ───────────────────────────────────────────────────────────────────
def read_smart(path: Path) -> str:
    for enc in ("utf-8", "utf-8-sig", "iso-8859-1", "cp1252"):
        try:
            return path.read_text(encoding=enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return path.read_text(encoding="iso-8859-1", errors="replace")

def flatten_json(obj: Any, prefix: str = "") -> Dict[str, str]:
    result: Dict[str, str] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                result.update(flatten_json(v, key))
            else:
                result[key] = str(v) if v is not None else ""
    return result

def unflatten_json(flat: Dict[str, str]) -> Dict:
    result: Dict = {}
    for dotted, value in flat.items():
        parts = dotted.split(".")
        d = result
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = value
    return result

def parse_properties(text: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith("!"):
            continue
        for sep in (":", "="):
            if sep in s:
                idx = s.index(sep)
                k, v = s[:idx].strip(), s[idx + 1:].strip()
                if k:
                    result[k] = v
                break
    return result

def serialize_properties(data: Dict[str, str], original: str = "") -> str:
    lines: List[str] = []
    touched: set = set()
    if original:
        for line in original.splitlines():
            s = line.strip()
            if not s or s.startswith("#") or s.startswith("!"):
                lines.append(line)
                continue
            key = None
            for sep in (":", "="):
                if sep in s:
                    key = s[: s.index(sep)].strip()
                    break
            if key and key in data:
                lines.append(f"{key}: {data[key]}")
                touched.add(key)
            else:
                lines.append(line)
        for k, v in data.items():
            if k not in touched:
                lines.append(f"{k}: {v}")
    else:
        lines = [f"{k}: {v}" for k, v in data.items()]
    return "\n".join(lines) + "\n"

def template_vars(text: str) -> set:
    return set(re.findall(r"\{\{[^}]+\}\}", text))

# Default descriptions for known language variants
DEFAULT_LANG_DESCRIPTIONS: Dict[str, str] = {
    "de": "German (formal, use 'Sie')",
    "de-informal": "German informal variant — use 'du' instead of 'Sie', otherwise same content as 'de'",
    "de-no-binnen-i": "German without gender-neutral language (no Binnen-I, no gender star *) — same content as 'de'",
    "en": "English",
    "de_DE": "German (Germany, formal)",
    "de_DE-informal": "German (Germany, informal, use 'du')",
    "en_EN": "English (generic)",
    "fr_FR": "French (France)",
    "it_IT": "Italian (Italy)",
    "es_ES": "Spanish (Spain)",
    "nl_NL": "Dutch (Netherlands)",
    "pl_PL": "Polish",
    "pt_PT": "Portuguese (Portugal)",
}

def get_lang_label(lang: str) -> str:
    """Return human-readable description for a language code, using config overrides then defaults."""
    cfg = load_config()
    descs = {**DEFAULT_LANG_DESCRIPTIONS, **cfg.get("lang_descriptions", {})}
    return descs.get(lang, lang)

def lang_instruction(lang: str) -> str:
    """Build the 'target language' instruction string for AI prompts."""
    label = get_lang_label(lang)
    if label == lang:
        return lang
    return f"{lang} ({label})"

def save_lang_description(lang: str, description: str):
    """Persist a language description override in config.json."""
    if not description or not description.strip():
        return
    cfg = load_config()
    descs = cfg.get("lang_descriptions", {})
    descs[lang] = description.strip()
    cfg["lang_descriptions"] = descs
    save_config(cfg)

# ── JSON area ─────────────────────────────────────────────────────────────────
JSON_DIR = DATA_DIR / "json"

def json_categories() -> List[str]:
    return sorted(d.name for d in JSON_DIR.iterdir() if d.is_dir())

def json_languages(category: str) -> List[str]:
    return sorted(f.stem for f in (JSON_DIR / category).glob("*.json"))

def load_json_category(category: str) -> Dict[str, Dict[str, str]]:
    """Returns {lang: {flat_key: value}}, preserving insertion order."""
    result: Dict[str, Dict[str, str]] = {}
    cat_dir = JSON_DIR / category
    for f in sorted(cat_dir.glob("*.json")):
        try:
            obj = json.loads(read_smart(f))
            result[f.stem] = flatten_json(obj)
        except Exception:
            result[f.stem] = {}
    return result

def ordered_json_keys(data: Dict[str, Dict[str, str]], ref_lang: str, sort: str = "file") -> List[str]:
    all_keys: set = set()
    for v in data.values():
        all_keys.update(v.keys())
    if sort == "alpha":
        return sorted(all_keys)
    # File order: use ref lang order, append any extras at end
    ref = data.get(ref_lang) or (list(data.values())[0] if data else {})
    seen = list(ref.keys())
    seen_set = set(seen)
    for key in all_keys:
        if key not in seen_set:
            seen.append(key)
    return seen

def ordered_mds_keys(data: Dict[str, Dict[str, str]], ref_lang: str, sort: str = "file") -> List[str]:
    all_keys: set = set()
    for v in data.values():
        all_keys.update(v.keys())
    if sort == "alpha":
        return sorted(all_keys)
    ref = data.get(ref_lang) or data.get("default") or (list(data.values())[0] if data else {})
    seen = list(ref.keys())
    seen_set = set(seen)
    for key in all_keys:
        if key not in seen_set:
            seen.append(key)
    return seen

# ── Mail area ─────────────────────────────────────────────────────────────────
MAIL_DIR = DATA_DIR / "mailtemplates"

def mail_lang_from_filename(name: str) -> str:
    m = re.search(r"templates_(.+)\.xml$", name)
    return m.group(1) if m else "default"

def load_mail_file(path: Path) -> Dict[str, Dict[str, str]]:
    """Returns {template_name: {subject?, message}}"""
    result: Dict[str, Dict[str, str]] = {}
    try:
        tree = ET.parse(path)
        for tmpl in tree.getroot().findall("template"):
            name = tmpl.get("name", "")
            entry: Dict[str, str] = {}
            subj = tmpl.find("subject")
            if subj is not None and subj.text:
                entry["subject"] = subj.text.strip()
            msg = tmpl.find("message")
            if msg is not None:
                raw = msg.text or ""
                entry["message"] = raw.strip()
            result[name] = entry
    except Exception:
        pass
    return result

def load_all_mail() -> Dict[str, Dict[str, Dict[str, str]]]:
    """Returns {lang: {template_name: {subject?, message}}}"""
    result: Dict[str, Dict[str, Dict[str, str]]] = {}
    for f in MAIL_DIR.glob("*.xml"):
        lang = mail_lang_from_filename(f.name)
        result[lang] = load_mail_file(f)
    return result

def save_mail_file(lang: str, templates: Dict[str, Dict[str, str]]):
    """Rebuild XML file from template dict."""
    fname = "templates.xml" if lang == "default" else f"templates_{lang}.xml"
    path = MAIL_DIR / fname
    # Read existing to preserve non-translated templates (header, stylesheet)
    existing = load_mail_file(path) if path.exists() else {}
    merged = {**existing, **templates}

    root = ET.Element("templates")
    for name, entry in merged.items():
        tmpl = ET.SubElement(root, "template", name=name)
        if "subject" in entry:
            s = ET.SubElement(tmpl, "subject")
            s.text = entry["subject"]
        if "message" in entry:
            m = ET.SubElement(tmpl, "message")
            m.text = ET.CDATA(f"\n\t\t\t{entry['message']}\n\t\t")  # type: ignore
    # ET doesn't support CDATA natively; write raw
    lines = ["<templates>"]
    for name, entry in merged.items():
        lines.append(f'\t<template name="{name}">')
        if "subject" in entry:
            lines.append(f"\t\t<subject>{entry['subject']}</subject>")
        if "message" in entry:
            msg = entry["message"]
            lines.append(f"\t\t<message><![CDATA[\n{msg}\n\t\t]]></message>")
        lines.append("\t</template>")
    lines.append("</templates>")
    path.write_text("\n".join(lines), encoding="utf-8")

# ── MDS area ──────────────────────────────────────────────────────────────────
MDS_I18N_DIR = DATA_DIR / "metadatasets" / "i18n"

def mds_groups() -> Dict[str, List[str]]:
    """Returns {group_prefix: [lang_codes]}"""
    groups: Dict[str, List[str]] = {}
    for f in sorted(MDS_I18N_DIR.glob("*.properties")):
        m = re.match(r"^(.+?)(?:_([a-z]{2}_[A-Z]{2}))?\.properties$", f.name)
        if not m:
            continue
        prefix, lang = m.group(1), m.group(2)
        if prefix not in groups:
            groups[prefix] = []
        if lang:
            groups[prefix].append(lang)
        else:
            if "default" not in groups[prefix]:
                groups[prefix].insert(0, "default")
    return groups

def load_mds_group(group: str) -> Dict[str, Dict[str, str]]:
    """Returns {lang: {key: value}}"""
    result: Dict[str, Dict[str, str]] = {}
    base = MDS_I18N_DIR / f"{group}.properties"
    if base.exists():
        result["default"] = parse_properties(read_smart(base))
    # Use full-match so "mds" group doesn't pick up "mds_brockhaus_de_DE.properties"
    pattern = re.compile(rf"^{re.escape(group)}_([a-z]{{2}}_[A-Z]{{2}})\.properties$")
    for f in sorted(MDS_I18N_DIR.glob("*.properties")):
        m = pattern.match(f.name)
        if m:
            result[m.group(1)] = parse_properties(read_smart(f))
    return result

# ── Stats helper ──────────────────────────────────────────────────────────────
def compute_stats() -> Dict:
    stats: Dict[str, Any] = {"areas": {}}

    # JSON stats
    cats = json_categories()
    json_langs: set = set()
    total_keys = 0
    missing = 0
    for cat in cats:
        data = load_json_category(cat)
        langs = list(data.keys())
        json_langs.update(langs)
        all_keys = set()
        for v in data.values():
            all_keys.update(v.keys())
        total_keys += len(all_keys)
        for k in all_keys:
            for lang in langs:
                if not data[lang].get(k, "").strip():
                    missing += 1
    stats["areas"]["json"] = {
        "categories": len(cats),
        "languages": sorted(json_langs),
        "total_keys": total_keys,
        "missing_values": missing,
    }

    # Mail stats
    mail = load_all_mail()
    all_tmpl: set = set()
    for v in mail.values():
        all_tmpl.update(v.keys())
    mail_missing = 0
    for tmpl in all_tmpl:
        for lang, data in mail.items():
            if tmpl not in data or not data[tmpl].get("message", "").strip():
                mail_missing += 1
    stats["areas"]["mail"] = {
        "languages": sorted(mail.keys()),
        "total_templates": len(all_tmpl),
        "missing_values": mail_missing,
    }

    # MDS stats
    groups = mds_groups()
    mds_langs: set = set()
    mds_keys = 0
    mds_missing = 0
    for grp in groups:
        data = load_mds_group(grp)
        for langs in data:
            mds_langs.add(langs)
        all_keys = set()
        for v in data.values():
            all_keys.update(v.keys())
        mds_keys += len(all_keys)
        for k in all_keys:
            for lang, d in data.items():
                if not d.get(k, "").strip():
                    mds_missing += 1
    stats["areas"]["mds"] = {
        "groups": sorted(groups.keys()),
        "languages": sorted(mds_langs),
        "total_keys": mds_keys,
        "missing_values": mds_missing,
    }
    return stats

# ── Endpoints: Info ───────────────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    return compute_stats()

# ── Endpoints: JSON ───────────────────────────────────────────────────────────
@app.get("/api/json/categories")
def get_json_categories():
    return json_categories()

@app.get("/api/json/{category}")
def get_json_category(category: str, sort: str = Query("file"), ref_lang: str = Query("de")):
    cats = json_categories()
    if category not in cats:
        raise HTTPException(404, f"Category '{category}' not found")
    data = load_json_category(category)
    languages = sorted(data.keys())
    keys = ordered_json_keys(data, ref_lang, sort)
    entries = []
    for key in keys:
        translations: Dict[str, str] = {}
        for lang in languages:
            translations[lang] = data[lang].get(key, "")
        entries.append({"key": key, "translations": translations})
    return {"category": category, "languages": languages, "entries": entries}

@app.put("/api/json/save")
def save_json(payload: SaveJsonPayload):
    path = JSON_DIR / payload.category / f"{payload.lang}.json"
    if not path.parent.exists():
        raise HTTPException(404, "Category not found")
    nested = unflatten_json(payload.flat)
    path.write_text(json.dumps(nested, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}

class DeleteKeyPayload(BaseModel):
    category: str
    key: str

class InsertKeyPayload(BaseModel):
    category: str
    key: str
    after_key: Optional[str] = None  # insert after this key; None = append

@app.delete("/api/json/key")
def delete_json_key(payload: DeleteKeyPayload):
    cat_dir = JSON_DIR / payload.category
    if not cat_dir.exists():
        raise HTTPException(404, "Category not found")
    for f in cat_dir.glob("*.json"):
        try:
            flat = flatten_json(json.loads(read_smart(f)))
            if payload.key in flat:
                del flat[payload.key]
                f.write_text(json.dumps(unflatten_json(flat), ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass
    return {"ok": True}

@app.post("/api/json/key")
def insert_json_key(payload: InsertKeyPayload):
    cat_dir = JSON_DIR / payload.category
    if not cat_dir.exists():
        raise HTTPException(404, "Category not found")
    for f in cat_dir.glob("*.json"):
        try:
            flat = flatten_json(json.loads(read_smart(f)))
            if payload.key in flat:
                continue  # key already exists, skip
            if payload.after_key and payload.after_key in flat:
                # Rebuild dict inserting the new key after after_key
                new_flat: Dict[str, str] = {}
                for k, v in flat.items():
                    new_flat[k] = v
                    if k == payload.after_key:
                        new_flat[payload.key] = ""
            else:
                new_flat = {**flat, payload.key: ""}
            f.write_text(json.dumps(unflatten_json(new_flat), ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass
    return {"ok": True}

@app.post("/api/json/add-language")
def add_json_language(req: AddLanguageRequest):
    cats = json_categories()
    for cat in cats:
        new_path = JSON_DIR / cat / f"{req.lang}.json"
        if new_path.exists():
            continue
        content = "{}"
        if req.base_on:
            base_path = JSON_DIR / cat / f"{req.base_on}.json"
            if base_path.exists():
                obj = json.loads(read_smart(base_path))
                def empty_vals(o):
                    if isinstance(o, dict):
                        return {k: empty_vals(v) for k, v in o.items()}
                    return ""
                content = json.dumps(empty_vals(obj), ensure_ascii=False, indent=2)
        new_path.write_text(content, encoding="utf-8")
    if req.description:
        save_lang_description(req.lang, req.description)
    return {"ok": True, "lang": req.lang}

# ── Endpoints: Mail ───────────────────────────────────────────────────────────
@app.get("/api/mail")
def get_mail():
    data = load_all_mail()
    all_tmpl: set = set()
    for v in data.values():
        all_tmpl.update(v.keys())
    languages = sorted(data.keys())
    entries = []
    for tmpl in sorted(all_tmpl):
        translations: Dict[str, Dict[str, str]] = {}
        for lang in languages:
            translations[lang] = data[lang].get(tmpl, {})
        entries.append({"name": tmpl, "translations": translations})
    return {"languages": languages, "entries": entries}

@app.put("/api/mail/save")
def save_mail(payload: SaveMailPayload):
    save_mail_file(payload.lang, payload.templates)
    return {"ok": True}

class DeleteMailTemplatePayload(BaseModel):
    name: str

class InsertMailTemplatePayload(BaseModel):
    name: str
    has_subject: bool = False

@app.delete("/api/mail/template")
def delete_mail_template(payload: DeleteMailTemplatePayload):
    for f in MAIL_DIR.glob("*.xml"):
        try:
            data = load_mail_file(f)
            if payload.name in data:
                del data[payload.name]
                save_mail_file(
                    "default" if f.name == "templates.xml" else f.stem.replace("templates_", ""),
                    data
                )
        except Exception:
            pass
    return {"ok": True}

@app.post("/api/mail/template")
def insert_mail_template(payload: InsertMailTemplatePayload):
    for f in MAIL_DIR.glob("*.xml"):
        try:
            data = load_mail_file(f)
            if payload.name not in data:
                entry: Dict[str, str] = {"message": ""}
                if payload.has_subject:
                    entry["subject"] = ""
                data[payload.name] = entry
                save_mail_file(
                    "default" if f.name == "templates.xml" else f.stem.replace("templates_", ""),
                    data
                )
        except Exception:
            pass
    return {"ok": True}

@app.post("/api/mail/add-language")
def add_mail_language(req: AddLanguageRequest):
    fname = f"templates_{req.lang}.xml"
    path = MAIL_DIR / fname
    if path.exists():
        if req.description:
            save_lang_description(req.lang, req.description)
        return {"ok": True, "lang": req.lang, "already_existed": True}
    default_data = load_mail_file(MAIL_DIR / "templates.xml")
    empty = {name: {"message": ""} for name in default_data}
    if "subject" in (list(default_data.values()) or [{}])[0]:
        empty = {name: {"subject": "", "message": ""} for name in default_data}
    save_mail_file(req.lang, empty)
    if req.description:
        save_lang_description(req.lang, req.description)
    return {"ok": True, "lang": req.lang}

# ── Endpoints: MDS ────────────────────────────────────────────────────────────
@app.get("/api/mds/groups")
def get_mds_groups():
    return mds_groups()

@app.get("/api/mds/{group}")
def get_mds_group(group: str, sort: str = Query("file"), ref_lang: str = Query("default")):
    all_groups = mds_groups()
    if group not in all_groups:
        raise HTTPException(404, f"Group '{group}' not found")
    data = load_mds_group(group)
    languages = sorted(data.keys())
    keys = ordered_mds_keys(data, ref_lang, sort)
    entries = []
    for key in keys:
        translations: Dict[str, str] = {}
        for lang in languages:
            translations[lang] = data[lang].get(key, "")
        entries.append({"key": key, "translations": translations})
    return {"group": group, "languages": languages, "entries": entries}

@app.put("/api/mds/save")
def save_mds(payload: SaveMdsPayload):
    fname = (
        f"{payload.group}.properties"
        if payload.lang == "default"
        else f"{payload.group}_{payload.lang}.properties"
    )
    path = MDS_I18N_DIR / fname
    original = read_smart(path) if path.exists() else ""
    path.write_text(serialize_properties(payload.translations, original), encoding="utf-8")
    return {"ok": True}

def _prop_line_key(line: str) -> Optional[str]:
    s = line.strip()
    if not s or s.startswith('#') or s.startswith('!'):
        return None
    for sep in (':', '='):
        if sep in s:
            return s[:s.index(sep)].strip()
    return None

def mds_files_for_group(group: str) -> List[Path]:
    files: List[Path] = []
    base = MDS_I18N_DIR / f"{group}.properties"
    if base.exists():
        files.append(base)
    pattern = re.compile(rf"^{re.escape(group)}_([a-z]{{2}}_[A-Z]{{2}})\.properties$")
    for f in sorted(MDS_I18N_DIR.glob("*.properties")):
        if pattern.match(f.name):
            files.append(f)
    return files

class DeleteMdsKeyPayload(BaseModel):
    group: str
    key: str

class InsertMdsKeyPayload(BaseModel):
    group: str
    key: str
    after_key: Optional[str] = None

@app.delete("/api/mds/key")
def delete_mds_key(payload: DeleteMdsKeyPayload):
    for f in mds_files_for_group(payload.group):
        try:
            content = read_smart(f)
            new_content = ''.join(
                line for line in content.splitlines(keepends=True)
                if _prop_line_key(line) != payload.key
            )
            f.write_text(new_content, encoding="utf-8")
        except Exception:
            pass
    return {"ok": True}

@app.post("/api/mds/key")
def insert_mds_key(payload: InsertMdsKeyPayload):
    new_line = f"{payload.key}: \n"
    for f in mds_files_for_group(payload.group):
        try:
            content = read_smart(f)
            # Skip if key already exists
            if any(_prop_line_key(l) == payload.key for l in content.splitlines(keepends=True)):
                continue
            if payload.after_key:
                lines = content.splitlines(keepends=True)
                result: List[str] = []
                inserted = False
                for line in lines:
                    result.append(line)
                    if not inserted and _prop_line_key(line) == payload.after_key:
                        result.append(new_line)
                        inserted = True
                if not inserted:
                    result.append(new_line)
                new_content = ''.join(result)
            else:
                new_content = content.rstrip('\n') + '\n' + new_line
            f.write_text(new_content, encoding="utf-8")
        except Exception:
            pass
    return {"ok": True}

@app.post("/api/mds/add-language")
def add_mds_language(req: AddLanguageRequest):
    all_groups = mds_groups()
    created = []
    for grp in all_groups:
        fname = f"{grp}_{req.lang}.properties"
        path = MDS_I18N_DIR / fname
        if not path.exists():
            path.write_text(f"# {req.lang} translations for {grp}\n", encoding="utf-8")
            created.append(fname)
    if req.description:
        save_lang_description(req.lang, req.description)
    return {"ok": True, "created": created}

# ── Endpoints: Config ────────────────────────────────────────────────────────
@app.get("/api/config")
def get_config_endpoint():
    cfg = load_config()
    env_key = os.getenv("B_API_KEY", "")
    merged_descs = {**DEFAULT_LANG_DESCRIPTIONS, **cfg.get("lang_descriptions", {})}
    return {
        "b_api_key_set": bool(env_key or cfg.get("b_api_key")),
        "b_api_key_source": "env" if env_key else ("config" if cfg.get("b_api_key") else "none"),
        "b_api_key": "" if env_key else cfg.get("b_api_key", ""),
        "custom_areas": cfg.get("custom_areas", []),
        "lang_descriptions": merged_descs,
        "lang_descriptions_custom": cfg.get("lang_descriptions", {}),
        "excluded_mds_groups": cfg.get("excluded_mds_groups", []),
        "excluded_json_categories": cfg.get("excluded_json_categories", []),
        "variant_filters": cfg.get("variant_filters", {}),
    }

@app.post("/api/config")
def set_config_endpoint(payload: ConfigPayload):
    cfg = load_config()
    if payload.b_api_key is not None:
        cfg["b_api_key"] = payload.b_api_key
    if payload.custom_areas is not None:
        cfg["custom_areas"] = payload.custom_areas
    if payload.lang_descriptions is not None:
        cfg["lang_descriptions"] = payload.lang_descriptions
    if payload.excluded_mds_groups is not None:
        cfg["excluded_mds_groups"] = payload.excluded_mds_groups
    if payload.excluded_json_categories is not None:
        cfg["excluded_json_categories"] = payload.excluded_json_categories
    if payload.variant_filters is not None:
        cfg["variant_filters"] = payload.variant_filters
    save_config(cfg)
    return {"ok": True}

# ── Endpoints: AI ─────────────────────────────────────────────────────────────
@app.post("/api/ai/translate")
def ai_translate(req: AiTranslateRequest):
    if not get_api_key():
        raise HTTPException(400, "B_API_KEY environment variable not set")
    api_key = get_api_key()
    src_label = lang_instruction(req.source_lang)
    tgt_label = lang_instruction(req.target_lang)
    system_msg = (
        "You are a professional translator. Translate the given text accurately. "
        "Preserve any template variables like {{variable}}, HTML tags, and formatting. "
        "Return ONLY the translated text, no explanations."
    )
    if req.context:
        system_msg += f"\nContext: {req.context}"
    try:
        resp = requests.post(
            f"{B_API_BASE}/chat/completions",
            headers={"Content-Type": "application/json", "X-API-KEY": api_key},
            json={
                "model": B_API_MODEL,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {
                        "role": "user",
                        "content": f"Translate from {src_label} to {tgt_label}:\n\n{req.text}",
                    },
                ],
                "temperature": 0.3,
                "max_tokens": 512,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"translation": data["choices"][0]["message"]["content"].strip()}
    except requests.RequestException as e:
        raise HTTPException(502, f"B-API error: {e}")

@app.post("/api/ai/fill-empty")
def ai_fill_empty(req: AiFillRequest):
    """Translate all empty fields for target_lang, using existing translations as context."""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "No API key configured")
    if req.area == "json":
        data = load_json_category(req.id)
    elif req.area == "mds":
        data = load_mds_group(req.id)
    else:
        raise HTTPException(400, "area must be json or mds")
    if req.target_lang not in data:
        raise HTTPException(404, f"Language '{req.target_lang}' not found")
    all_keys: set = set()
    for v in data.values():
        all_keys.update(v.keys())
    empty_keys = [
        k for k in all_keys
        if not data[req.target_lang].get(k, "").strip()
    ]
    if not empty_keys:
        return {"translations": {}, "count": 0}
    # Build numbered list with context
    lines = []
    for i, key in enumerate(empty_keys):
        existing = {lang: val for lang, val in
                    ((l, data[l].get(key, "")) for l in data if l != req.target_lang)
                    if val.strip()}
        context_str = "; ".join(f"{l}: {v}" for l, v in list(existing.items())[:3])
        lines.append(f"{i+1}. [key={key}] {context_str}")
    prompt = "\n".join(lines)
    tgt_label = lang_instruction(req.target_lang)
    try:
        resp = requests.post(
            f"{B_API_BASE}/chat/completions",
            headers={"Content-Type": "application/json", "X-API-KEY": api_key},
            json={
                "model": B_API_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            f"You are a professional translator. For each numbered item, "
                            f"produce a translation in '{tgt_label}'. "
                            f"Each item shows existing translations as context (format: lang: value). "
                            f"Preserve {{{{variable}}}} placeholders and HTML exactly. "
                            f"Reply ONLY with lines in format: N. <translation>"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 4096,
            },
            timeout=120,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        result_lines = re.findall(r"^\d+\.\s*(.+)$", content, re.MULTILINE)
        translations = {}
        for i, key in enumerate(empty_keys):
            if i < len(result_lines):
                translations[key] = result_lines[i].strip()
        return {"translations": translations, "count": len(translations)}
    except requests.RequestException as e:
        raise HTTPException(502, f"B-API error: {e}")

@app.post("/api/ai/review")
def ai_review_translations(req: AiReviewRequest):
    """Review existing translations for quality issues."""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "No API key configured")
    if req.area == "json":
        data = load_json_category(req.id)
    elif req.area == "mds":
        data = load_mds_group(req.id)
    else:
        raise HTTPException(400, "area must be json or mds")
    ref = data.get(req.ref_lang, {})
    target = data.get(req.target_lang, {})
    if not ref or not target:
        raise HTTPException(404, "ref or target language not found")
    # Pick keys that have both ref and target values
    reviewable = [
        k for k in list(ref.keys())[:req.max_keys]
        if ref.get(k, "").strip() and target.get(k, "").strip()
    ]
    if not reviewable:
        return {"issues": []}
    src_label = lang_instruction(req.ref_lang)
    tgt_label = lang_instruction(req.target_lang)
    lines = [f"{i+1}. key={k} | {req.ref_lang}: {ref[k]} | {req.target_lang}: {target[k]}"
             for i, k in enumerate(reviewable)]
    prompt = "\n".join(lines)
    try:
        resp = requests.post(
            f"{B_API_BASE}/chat/completions",
            headers={"Content-Type": "application/json", "X-API-KEY": api_key},
            json={
                "model": B_API_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            f"You are a translation quality reviewer. "
                            f"Review these translations from '{src_label}' to '{tgt_label}'. "
                            f"For each item report ONLY real issues (wrong meaning, missing {{{{vars}}}}, "
                            f"untranslated text, awkward phrasing). "
                            f"Format: N. <issue description> | suggestion: <better translation>. "
                            f"If no issue, skip the item entirely."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 2048,
            },
            timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        issues = []
        for line in content.splitlines():
            m = re.match(r"^(\d+)\. (.+?)\s*\|\s*suggestion:\s*(.+)$", line)
            if m:
                idx = int(m.group(1)) - 1
                if 0 <= idx < len(reviewable):
                    issues.append({
                        "key": reviewable[idx],
                        "current": target[reviewable[idx]],
                        "issue": m.group(2).strip(),
                        "suggestion": m.group(3).strip(),
                    })
        return {"issues": issues, "reviewed": len(reviewable)}
    except requests.RequestException as e:
        raise HTTPException(502, f"B-API error: {e}")

@app.post("/api/ai/translate-batch")
def ai_translate_batch(
    texts: List[str],
    source_lang: str = Query(...),
    target_lang: str = Query(...),
):
    if not get_api_key():
        raise HTTPException(400, "B_API_KEY environment variable not set")
    api_key = get_api_key()
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    try:
        resp = requests.post(
            f"{B_API_BASE}/chat/completions",
            headers={"Content-Type": "application/json", "X-API-KEY": api_key},
            json={
                "model": B_API_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Translate each numbered item from "
                            f"{source_lang} to {target_lang}. "
                            "Keep the same numbering. Preserve {{variables}} and HTML. "
                            "Reply only with numbered translations."
                        ),
                    },
                    {"role": "user", "content": numbered},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
            },
            timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        lines = re.findall(r"^\d+\.\s(.+)$", content, re.MULTILINE)
        return {"translations": lines}
    except requests.RequestException as e:
        raise HTTPException(502, f"B-API error: {e}")

# ── Endpoints: Backup ─────────────────────────────────────────────────────────
@app.post("/api/backup")
def create_backup():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"backup_{ts}"
    shutil.copytree(str(DATA_DIR), str(dest))
    # Keep only last 10 backups
    backups = sorted(BACKUP_DIR.iterdir())
    for old in backups[:-10]:
        shutil.rmtree(old, ignore_errors=True)
    return {"ok": True, "backup": dest.name}

@app.get("/api/backups")
def list_backups():
    if not BACKUP_DIR.exists():
        return []
    return sorted(
        (b.name for b in BACKUP_DIR.iterdir() if b.is_dir()), reverse=True
    )

# ── Endpoints: Download ───────────────────────────────────────────────────────
@app.get("/api/download/{area}")
def download_area(area: str):
    area_paths = {
        "json": DATA_DIR / "json",
        "mail": DATA_DIR / "mailtemplates",
        "mds": DATA_DIR / "metadatasets",
    }
    if area not in area_paths:
        raise HTTPException(404, "Unknown area")
    src = area_paths[area]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in src.rglob("*"):
            if f.is_file():
                zf.write(f, f.relative_to(src.parent))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={area}.zip"},
    )

@app.get("/api/download-all")
def download_all():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in DATA_DIR.rglob("*"):
            if f.is_file():
                zf.write(f, f.relative_to(DATA_DIR.parent))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=i18n_all.zip"},
    )

# ── Quality checks ────────────────────────────────────────────────────────────
@app.get("/api/json/{category}/quality")
def json_quality(category: str):
    data = load_json_category(category)
    languages = sorted(data.keys())
    all_keys = set()
    for v in data.values():
        all_keys.update(v.keys())

    ref_lang = "de" if "de" in languages else (languages[0] if languages else None)
    issues = []

    for key in sorted(all_keys):
        ref_val = data.get(ref_lang, {}).get(key, "") if ref_lang else ""
        ref_vars = template_vars(ref_val)
        for lang in languages:
            val = data[lang].get(key, "")
            if not val.strip():
                issues.append({"key": key, "lang": lang, "type": "missing"})
            elif ref_vars:
                val_vars = template_vars(val)
                if val_vars != ref_vars:
                    issues.append({
                        "key": key, "lang": lang, "type": "template_mismatch",
                        "expected": sorted(ref_vars), "found": sorted(val_vars),
                    })
    return {"category": category, "ref_lang": ref_lang, "issues": issues}

@app.get("/api/mds/{group}/quality")
def mds_quality(group: str):
    data = load_mds_group(group)
    languages = sorted(data.keys())
    all_keys = set()
    for v in data.values():
        all_keys.update(v.keys())
    issues = []
    for key in sorted(all_keys):
        for lang in languages:
            if not data[lang].get(key, "").strip():
                issues.append({"key": key, "lang": lang, "type": "missing"})
    return {"group": group, "issues": issues}
