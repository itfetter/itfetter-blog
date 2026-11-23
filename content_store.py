import json
import secrets
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
SEED = ROOT / "content.js"
DATA = ROOT / "blog-data.json"
COLLECTIONS = ("posts", "notes", "projects")


def read_content():
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
    public = {"topics": data["topics"], "settings": data["settings"]}
    for collection in COLLECTIONS:
        public[collection] = [{key: value for key, value in item.items() if key != "draft"} for item in data[collection] if item["status"] == "published"]
    comments = data.get("comments", {})
    engagement = data.get("engagement", {})
    for post in public["posts"]:
        post["commentCount"] = len(comments.get(post["id"], []))
        stats = engagement.get(post["id"], {})
        post["viewCount"] = stats.get("views", 0)
        post["likeCount"] = len(stats.get("likes", []))
    return "window.blogContent = " + json.dumps(public, ensure_ascii=False) + ";\n"


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
            if fields["cover"].startswith("assets/"):
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


def update_engagement(data, post_id, visitor, action):
    if not any(post["id"] == post_id and post["status"] == "published" for post in data["posts"]):
        raise LookupError("文章不存在或尚未发布。")
    stats = data.setdefault("engagement", {}).setdefault(post_id, {"views": 0, "likes": [], "day": "", "visitors": []})
    changed = False
    if action == "view":
        today = date.today().isoformat()
        if stats["day"] != today:
            stats.update(day=today, visitors=[])
        if visitor not in stats["visitors"]:
            stats["visitors"].append(visitor)
            stats["views"] += 1
            changed = True
    elif action == "like" and visitor not in stats["likes"]:
        stats["likes"].append(visitor)
        changed = True
    elif action == "unlike" and visitor in stats["likes"]:
        stats["likes"].remove(visitor)
        changed = True
    return {"viewCount": stats["views"], "likeCount": len(stats["likes"]), "liked": visitor in stats["likes"]}, changed


def article_comments(data, post_id):
    if not any(post["id"] == post_id and post["status"] == "published" for post in data["posts"]):
        raise LookupError("这篇文章暂无开放的评论区。")
    return data.get("comments", {}).get(post_id, [])


def add_article_comment(data, post_id, payload):
    comments = article_comments(data, post_id)
    if not isinstance(payload, dict):
        raise ValueError("评论格式有误。")
    comment = text_fields(payload, {"author": 40, "body": 2000, "parent": 100}, ("parent",))
    if comment["parent"] and not any(item["id"] == comment["parent"] and not item["parent"] for item in comments):
        raise ValueError("回复的评论已不存在。")
    comment.update(id=secrets.token_hex(8), created=datetime.now(timezone.utc).isoformat())
    data.setdefault("comments", {}).setdefault(post_id, []).append(comment)
    return data["comments"][post_id]


def write_content(data):
    pending = DATA.with_suffix(".tmp")
    pending.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pending.replace(DATA)
