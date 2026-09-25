import os
import requests

VK_API_URL = "https://api.vk.com/method/"
VK_API_VERSION = "5.199"
VK_TOKEN = os.environ["VK_TOKEN"]
VK_OWNER_ID = os.environ["VK_OWNER_ID"]

IMAGE_URL = "https://storage.yandexcloud.net/ranepa-news-media/news/2026/09/img-3004-mug1xb07-422fe4a2.jpg"

def vk(method, params):
    r = requests.post(VK_API_URL + method, data={**params, "access_token": VK_TOKEN, "v": VK_API_VERSION}, timeout=30)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        e = data["error"]
        raise RuntimeError(f"VK API error {e.get('error_code')}: {e.get('error_msg')}")
    return data["response"]

group_id = str(VK_OWNER_ID).lstrip("-")
owner_id = "-" + group_id

print("Скачиваем тестовое изображение...")
img = requests.get(IMAGE_URL, timeout=60)
img.raise_for_status()
ctype = img.headers.get("Content-Type", "image/jpeg").split(";", 1)[0]

print("Получаем сервер загрузки документов VK...")
server = vk("docs.getWallUploadServer", {"group_id": group_id})
upload_url = server["upload_url"]

print("Загружаем JPG как документ...")
up = requests.post(upload_url, files={"file": ("vk-image-test.jpg", img.content, ctype)}, timeout=90)
up.raise_for_status()
ud = up.json()
if "error" in ud:
    raise RuntimeError(f"Upload error: {ud['error']}")
file_token = ud.get("file")
if not file_token:
    raise RuntimeError(f"VK upload server did not return file: {ud}")

print("Сохраняем документ...")
saved = vk("docs.save", {"file": file_token, "title": "vk-image-test"})
if isinstance(saved, dict) and "doc" in saved:
    doc = saved["doc"]
elif isinstance(saved, list) and saved:
    doc = saved[0]
else:
    doc = saved
if not isinstance(doc, dict) or doc.get("owner_id") is None or doc.get("id") is None:
    raise RuntimeError(f"Unexpected docs.save response: {saved}")

attachment = f"doc{doc['owner_id']}_{doc['id']}"
print(f"Документ сохранён: {attachment}")

print("Создаём один тестовый пост...")
posted = vk("wall.post", {
    "owner_id": owner_id,
    "from_group": 1,
    "message": "ТЕСТ изображения для автоматической публикации. Пост можно удалить.",
    "attachments": attachment,
})
print(f"TEST_SUCCESS post_id={posted.get('post_id')} attachment={attachment}")
