import json
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
SEED = ROOT / "content.js"
DATA = Path(os.environ.get("BLOG_DATA_DIR", ROOT)) / "blog-data.json"
COLLECTIONS = ("posts", "notes", "projects")


def legacy_content():
    if not DATA.exists():
        return json.loads(SEED.read_text(encoding="utf-8").removeprefix("window.blogContent = ").strip().removesuffix(";"))
    data = json.loads(DATA.read_text(encoding="utf-8"))
    samples = [post for post in data["posts"] if post.get("sample")]
    if not samples:
        return data
    seed = json.loads(SEED.read_text(encoding="utf-8").removeprefix("window.blogContent = ").strip().removesuffix(";"))
    originals = {post["id"]: post for post in seed["posts"]}
    for post in samples:
        original = originals.get(post["id"], {})
        for version in (post, post.get("draft")):
            if version is None:
                continue
            if "cover" in original:
                version.setdefault("cover", original["cover"])
                version.setdefault("coverAlt", original["coverAlt"])
            if post["id"] == "working-with-coding-agents" and version.get("sample", True):
                caption = "\n\n文章列表验收示例\n\n"
                old_body, _, table = original["body"].partition(caption)
                last_paragraph = old_body.rsplit("\n\n", 1)[-1]
                if last_paragraph in version["body"] and caption not in version["body"]:
                    version["body"] = version["body"].replace(last_paragraph, last_paragraph + caption + table, 1)
    return data


def public_script(data):
    return "window.blogContent = " + json.dumps(data, ensure_ascii=False) + ";\n"


def text_fields(values, limits, optional=()):
    fields = {}
    for field, limit in limits.items():
        value = values.get(field, "")
        if not isinstance(value, str) or len(value) > limit or (field not in optional and not value.strip()):
            raise ValueError("请填写必填项，并检查内容长度。")
        fields[field] = value.strip()
    return fields


def validate_url(value):
    if value:
        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname:
            raise ValueError("链接必须是有效的 HTTP 或 HTTPS 地址。")


def update_content(data, change):
    if not isinstance(change, dict):
        raise ValueError("提交内容格式有误。")
    collection = change.get("collection")
    item_id = change.get("id")
    values = change.get("item")
    if collection == "settings":
        if not isinstance(values, dict):
            raise ValueError("站点设置格式有误。")
        settings = text_fields(values, {"title": 70, "author": 50, "description": 350, "about": 8000, "github": 300, "featured": 100}, ("github", "featured"))
        validate_url(settings["github"])
        if settings["featured"] and not any(item["id"] == settings["featured"] and item["status"] == "published" for item in data["posts"]):
            raise ValueError("首页置顶只能选择已发布的文章。")
        data["settings"] = settings
        return

    if collection not in COLLECTIONS or not isinstance(item_id, str):
        raise ValueError("未找到要管理的内容类型。")
    items = data[collection]
    current = next((item for item in items if item["id"] == item_id), None)
    if item_id and current is None:
        raise ValueError("该内容不存在，请刷新后台后重试。")
    if change.get("action") == "withdraw":
        if collection != "posts" or not current or current["status"] != "published":
            raise ValueError("只能撤回已发布的文章。")
        items[items.index(current)] = current.get("draft", {**current, "status": "draft"})
        if data["settings"]["featured"] == item_id:
            data["settings"]["featured"] = ""
        return
    if values is None and current is not None:
        items.remove(current)
        if collection == "posts":
            data.get("comments", {}).pop(item_id, None)
            data.get("engagement", {}).pop(item_id, None)
            for project in data["projects"]:
                if project.get("post") == item_id:
                    project["post"] = ""
    elif isinstance(values, dict):
        common = {"title": 150, "status": 12}
        if collection == "posts":
            fields = text_fields(values, {**common, "topic": 20, "date": 10, "summary": 350, "body": 180000, "cover": 500, "coverAlt": 150}, ("summary", "body", "cover", "coverAlt"))
            if current:
                previous = current["draft"] if fields["status"] == "draft" and "draft" in current else current
                for field in ("cover", "coverAlt"):
                    if field not in values:
                        fields[field] = previous.get(field, "")
            if MEDIA_URL.fullmatch(fields["cover"]):
                pass
            elif fields["cover"].startswith("assets/"):
                filename = fields["cover"].removeprefix("assets/")
                if not filename or any(char in filename for char in "/\\?#") or not (ROOT / "assets" / filename).is_file():
                    raise ValueError("请选择已有的本地封面，或填写 HTTP / HTTPS 图片地址。")
            else:
                validate_url(fields["cover"])
            if fields["topic"] not in data["topics"]:
                raise ValueError("请选择文章主题。")
            if fields["status"] == "published" and not (fields["summary"] and fields["body"]):
                raise ValueError("发布文章前请填写摘要和正文。")
            fields["sample"] = False
        elif collection == "notes":
            fields = text_fields(values, {**common, "kind": 40, "date": 10, "text": 350, "detail": 8000}, ("detail",))
        else:
            fields = text_fields(values, {**common, "kind": 40, "text": 350, "detail": 8000, "post": 100, "url": 300}, ("detail", "post", "url"))
            validate_url(fields["url"])
            if fields["post"] and not any(post["id"] == fields["post"] for post in data["posts"]):
                raise ValueError("请选择现有文章作为项目关联。")
        if fields["status"] not in ("published", "draft"):
            raise ValueError("请选择草稿或已发布状态。")
        if "date" in fields:
            fields["date"] = date.fromisoformat(fields["date"]).isoformat()
        fields["id"] = item_id or secrets.token_hex(6)
        if collection != "posts" and current and current.get("sample"):
            fields["sample"] = True
        if current is None:
            items.append(fields)
        elif collection == "posts" and current["status"] == "published" and fields["status"] == "draft":
            current["draft"] = fields
            return
        else:
            items[items.index(current)] = fields
    else:
        raise ValueError("提交内容格式有误。")

    if collection == "posts" and data["settings"]["featured"] == item_id:
        if values is None or fields["status"] != "published":
            data["settings"]["featured"] = ""


def validate_comment(comments, payload):
    if not isinstance(payload, dict):
        raise ValueError("评论格式有误。")
    comment = text_fields(payload, {"author": 40, "body": 2000, "parent": 100}, ("parent",))
    if comment["parent"] and not any(item["id"] == comment["parent"] and not item["parent"] for item in comments):
        raise ValueError("回复的评论已不存在。")
    comment.update(id=secrets.token_hex(8), created=datetime.now(timezone.utc).isoformat())
    return comment


MEDIA_URL = re.compile(r"/media/([a-f0-9]{32}\.(?:png|jpe?g|webp|gif))(?![\w.])")

SCHEMA = (
    "CREATE TABLE metadata (key TEXT PRIMARY KEY, payload TEXT NOT NULL)",
    "CREATE TABLE entries (collection TEXT, id TEXT, status TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id))",
    "CREATE INDEX entry_status ON entries(collection,status)",
    "CREATE TABLE comments (post_id TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(post_id,id))",
    "CREATE TABLE stats (post_id TEXT PRIMARY KEY, views INTEGER NOT NULL, day TEXT NOT NULL)",
    "CREATE TABLE reactions (post_id TEXT, kind TEXT, visitor TEXT, PRIMARY KEY(post_id,kind,visitor))",
    "CREATE TABLE public_media (collection TEXT, entry_id TEXT, name TEXT, PRIMARY KEY(collection,entry_id,name))",
    "CREATE INDEX media_name ON public_media(name)",
)


@contextmanager
def database(write=False):
    connection = sqlite3.connect(DATA.with_name("blog.sqlite3"), timeout=10)
    try:
        with connection:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection
    finally:
        connection.close()


def put_entry(db, collection, item):
    db.execute(
        "INSERT INTO entries VALUES (?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET status=excluded.status,payload=excluded.payload",
        (collection, item["id"], item["status"], json.dumps(item, ensure_ascii=False)),
    )
    db.execute("DELETE FROM public_media WHERE collection=? AND entry_id=?", (collection, item["id"]))
    if item["status"] == "published":
        names = {name for key in ("body", "cover", "detail") for name in MEDIA_URL.findall(item.get(key, ""))}
        db.executemany("INSERT INTO public_media VALUES (?,?,?)", ((collection, item["id"], name) for name in names))


def put_metadata(db, key, value):
    db.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", (key, json.dumps(value, ensure_ascii=False)))


def initialize_store():
    with database(write=True) as db:
        if db.execute("PRAGMA user_version").fetchone()[0]:
            return
        for statement in SCHEMA:
            db.execute(statement)
        data = legacy_content()
        for key in ("topics", "settings"):
            put_metadata(db, key, data[key])
        for collection in COLLECTIONS:
            for item in data[collection]:
                put_entry(db, collection, item)
        for post_id, comments in data.get("comments", {}).items():
            db.executemany("INSERT INTO comments VALUES (?,?,?)", ((post_id, item["id"], json.dumps(item, ensure_ascii=False)) for item in comments))
        for post_id, stats in data.get("engagement", {}).items():
            db.execute("INSERT INTO stats VALUES (?,?,?)", (post_id, stats["views"], stats["day"]))
            for kind, key in (("like", "likes"), ("view", "visitors")):
                db.executemany("INSERT OR IGNORE INTO reactions VALUES (?,?,?)", ((post_id, kind, visitor) for visitor in stats[key]))
        db.execute("PRAGMA user_version=1")


def read_content(db, public=False):
    data = {key: json.loads(value) for key, value in db.execute("SELECT key,payload FROM metadata")}
    for collection in COLLECTIONS:
        data[collection] = []
    query = "SELECT collection,payload FROM entries"
    if public:
        query += " WHERE status='published'"
    for collection, payload in db.execute(query + " ORDER BY rowid"):
        item = json.loads(payload)
        if public:
            item.pop("draft", None)
        data[collection].append(item)
    if public:
        for item in data["posts"]:
            args = (item["id"],)
            counts = db.execute("""SELECT
                (SELECT count(*) FROM comments WHERE post_id=?1),
                COALESCE((SELECT views FROM stats WHERE post_id=?1),0),
                (SELECT count(*) FROM reactions WHERE post_id=?1 AND kind='like')
            """, args).fetchone()
            item.update(zip(("commentCount","viewCount","likeCount"), counts))
        return data
    data["comments"] = {}
    for post_id, payload in db.execute("SELECT post_id,payload FROM comments ORDER BY rowid"):
        data["comments"].setdefault(post_id, []).append(json.loads(payload))
    data["engagement"] = {post_id: {"views": views, "day": day, "likes": [], "visitors": []}
                          for post_id, views, day in db.execute("SELECT * FROM stats")}
    for post_id, kind, visitor in db.execute("SELECT * FROM reactions ORDER BY rowid"):
        data["engagement"][post_id]["likes" if kind == "like" else "visitors"].append(visitor)
    return data


def save_change(db, change):
    data = read_content(db)
    prior = {key: {item["id"]: deepcopy(item) for item in data[key]} for key in COLLECTIONS}
    prior_settings = data["settings"].copy()
    update_content(data, change)
    for collection in COLLECTIONS:
        for item in data[collection]:
            if item != prior[collection].pop(item["id"], None):
                put_entry(db, collection, item)
        for entry_id in prior[collection]:
            db.execute("DELETE FROM entries WHERE collection=? AND id=?", (collection, entry_id))
            db.execute("DELETE FROM public_media WHERE collection=? AND entry_id=?", (collection, entry_id))
            if collection == "posts":
                for table in ("comments", "stats", "reactions"):
                    db.execute(f"DELETE FROM {table} WHERE post_id=?", (entry_id,))
    if data["settings"] != prior_settings:
        put_metadata(db, "settings", data["settings"])
    return data


def published_post(db, post_id):
    return db.execute("SELECT 1 FROM entries WHERE collection='posts' AND id=? AND status='published'", (post_id,)).fetchone()


def store_engagement(db, post_id, visitor, action):
    if not published_post(db, post_id):
        raise LookupError("文章不存在或尚未发布。")
    today = date.today().isoformat()
    db.execute("INSERT OR IGNORE INTO stats VALUES (?,0,?)", (post_id, today))
    if action == "view":
        changed = db.execute("UPDATE stats SET day=? WHERE post_id=? AND day<>?", (today, post_id, today))
        if changed.rowcount:
            db.execute("DELETE FROM reactions WHERE post_id=? AND kind='view'", (post_id,))
        added = db.execute("INSERT OR IGNORE INTO reactions VALUES (?,'view',?)", (post_id, visitor))
        if added.rowcount:
            db.execute("UPDATE stats SET views=views+1 WHERE post_id=?", (post_id,))
    elif action == "like":
        db.execute("INSERT OR IGNORE INTO reactions VALUES (?,'like',?)", (post_id, visitor))
    else:
        db.execute("DELETE FROM reactions WHERE post_id=? AND kind='like' AND visitor=?", (post_id, visitor))
    views = db.execute("SELECT views FROM stats WHERE post_id=?", (post_id,)).fetchone()[0]
    count, liked = db.execute("SELECT count(*),max(visitor=?) FROM reactions WHERE post_id=? AND kind='like'", (visitor, post_id)).fetchone()
    return {"viewCount": views, "likeCount": count, "liked": bool(liked)}


def store_comments(db, post_id, payload=None, submit=False):
    if not published_post(db, post_id):
        raise LookupError("这篇文章暂无开放的评论区。")
    comments = [json.loads(value) for (value,) in db.execute("SELECT payload FROM comments WHERE post_id=? ORDER BY rowid", (post_id,))]
    if submit:
        comment = validate_comment(comments, payload)
        db.execute("INSERT INTO comments VALUES (?,?,?)", (post_id, comment["id"], json.dumps(comment, ensure_ascii=False)))
        comments.append(comment)
    return comments
