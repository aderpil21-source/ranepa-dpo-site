import os
import requests
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv, find_dotenv

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)

TOKEN = os.getenv("VK_TOKEN", "").strip(" '\"\n\r")
OWNER_ID = os.getenv("VK_OWNER_ID", "").strip(" '\"\n\r")
API_VERSION = "5.199"
SITE_URL = "https://ranepa-dpo39.ru/"
API_BASE = "https://script.google.com/macros/s/AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk/exec"
STATE_FILE = "last_news_id.txt"

def fetch_latest_news():
    try:
        response = requests.get(API_BASE, params={"type": "news"}, timeout=10)
        data = response.json()
        published = [i for i in data.get('items', []) if i.get('status') == 'published']
        return published[0] if published else None
    except Exception as e:
        print(f"Ошибка при запросе к API сайта: {e}")
        return None

def get_cover_image_url(item):
    cover = (item.get('coverImage') or '').strip()
    if cover:
        return normalize_image_url(cover)
    for b in item.get('blocks', []) or []:
        if b.get('type') == 'image' and b.get('url') and not b.get('hidden'):
            return normalize_image_url(b['url'])
    return None

def normalize_image_url(url):
    if 'drive.google.com' in url:
        import re
        m = re.search(r'[?&]id=([\w-]+)', url) or re.search(r'/file/d/([\w-]+)', url)
        if m:
            return f"https://drive.google.com/uc?export=view&id={m.group(1)}"
    return url

def upload_photo_to_vk(image_url, token):
    print(f"DEBUG: Пробуем скачать обложку: {image_url}")
    try:
        img_resp = requests.get(image_url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        img_resp.raise_for_status()
        
        img = Image.open(BytesIO(img_resp.content))
        if img.mode != 'RGB':
            img = img.convert('RGB')
            
        output_buffer = BytesIO()
        img.save(output_buffer, format="JPEG", quality=95)
        image_bytes = output_buffer.getvalue()
        
        print(f"DEBUG: Картинка готова, {len(image_bytes)} байт")
    except Exception as e:
        print(f"DEBUG: Ошибка работы с картинкой: {e}")
        return None

    print("DEBUG: Получаем сервер загрузки ВК...")
    
    # ИСПРАВЛЕНИЕ: Для токена группы НЕ передаем group_id
    upload_server_resp = requests.get(
        "https://api.vk.com/method/photos.getWallUploadServer",
        params={"access_token": token, "v": API_VERSION},
        timeout=15
    ).json()

    if 'response' not in upload_server_resp:
        print(f"DEBUG: Ошибка сервера: {upload_server_resp}")
        return None

    print("DEBUG: Загружаем файл...")
    try:
        upload_resp = requests.post(
            upload_server_resp['response']['upload_url'],
            files={"photo": ("cover.jpg", image_bytes)},
            timeout=30
        ).json()
    except Exception as e:
        print(f"DEBUG: Ошибка POST-запроса: {e}")
        return None

    if not upload_resp.get('photo') or upload_resp.get('photo') == '[]':
        print(f"DEBUG: Файл отклонен: {upload_resp}")
        return None

    print("DEBUG: Сохраняем фото...")
    
    # ИСПРАВЛЕНИЕ: Для токена группы НЕ передаем group_id
    save_resp = requests.post(
        "https://api.vk.com/method/photos.saveWallPhoto",
        data={
            "photo": upload_resp['photo'],
            "server": upload_resp['server'],
            "hash": upload_resp['hash'],
            "access_token": token,
            "v": API_VERSION
        },
        timeout=15
    ).json()

    if 'response' in save_resp and save_resp['response']:
        photo = save_resp['response'][0]
        print("DEBUG: Фото успешно прикреплено!")
        return f"photo{photo['owner_id']}_{photo['id']}"
        
    print(f"DEBUG: Ошибка saveWallPhoto: {save_resp}")
    return None

def auto_post_latest_news():
    item = fetch_latest_news()
    if not item:
        print("Нет опубликованных новостей.")
        return

    news_id = str(item.get('id', ''))
    
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            if f.read().strip() == news_id:
                print(f"Новость {news_id} уже опубликована. Пропуск.")
                return

    title = item.get('title', 'Новость Центра')
    lead = item.get('lead', '')
    real_url = f"{SITE_URL}news.html#{news_id}" if news_id else f"{SITE_URL}news.html"
    
    message = f"🔥 {title}\n\n{lead}\n\nЧитать подробнее на сайте: {real_url}"

    # Сначала пытаемся загрузить картинку через нашу функцию
    attachment_str = ""
    cover_url = get_cover_image_url(item)
    if cover_url:
        print(f"Найдена обложка: {cover_url}, загружаем в ВК...")
        photo_attachment = upload_photo_to_vk(cover_url, TOKEN)
        if photo_attachment:
            attachment_str = photo_attachment
            print(f"Картинка успешно прикрепится к посту: {attachment_str}")
        else:
            print("Не удалось загрузить картинку, постим без неё.")

    group_post_id = OWNER_ID if str(OWNER_ID).startswith('-') else f"-{OWNER_ID}"

    payload = {
        'owner_id': group_post_id,
        'from_group': 1,
        'message': message,
        'attachments': attachment_str, # Передаем ID загруженной картинки
        'access_token': TOKEN,
        'v': API_VERSION
    }

    print("DEBUG: Отправляем пост на стену...")
    response = requests.post("https://api.vk.com/method/wall.post", data=payload)
    result = response.json()

    if 'response' in result:
        print(f"Успешно! ID записи: {result['response']['post_id']}")
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            f.write(news_id)
    else:
        print(f"Ошибка публикации в ВК: {result}")