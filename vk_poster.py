import os
import re
import requests
from dotenv import load_dotenv, find_dotenv

# Принудительно ищем и загружаем .env файл в директории проекта
dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"Найден и загружен файл конфигурации: {dotenv_path}")
else:
    print("ВНИМАНИЕ: Файл .env не найден! Проверь его наличие в папке проекта.")

# Загружаем ключи и жестко очищаем их от мусора
TOKEN = os.getenv("VK_TOKEN", "").strip(" '\"\n\r")
OWNER_ID = os.getenv("VK_OWNER_ID", "").strip(" '\"\n\r")

print(f"DEBUG -> TOKEN загружен: {'ДА (длина ' + str(len(TOKEN)) + ')' if TOKEN else 'НЕТ (пусто)'}")
print(f"DEBUG -> OWNER_ID загружен: {OWNER_ID}")

API_VERSION = "5.131"
SITE_URL = "https://ranepa-dpo39.ru/"
API_BACKEND_URL = "https://script.google.com/macros/s/AKfycbznjvWDxlxxlANkzTCChnvlyEbW3N74vpOEE8pJaccExiXQG7DZU1SghQApDslMNEOk/exec?type=news"

def fetch_latest_news_from_api():
    try:
        response = requests.get(API_BACKEND_URL, timeout=10)
        data = response.json()
        items = data.get('items', [])
        
        published_items = [item for item in items if item.get('status') == 'published']
        if not published_items:
            print("Нет опубликованных новостей в базе.")
            return None, None, None, None

        latest = published_items[0]
        title = latest.get('title', 'Новость Центра')
        lead = latest.get('lead', '')
        news_id = latest.get('id', '')
        
        cover_image = latest.get('coverImage', '')
        if not cover_image and latest.get('blocks'):
            for block in latest.get('blocks', []):
                if block.get('type') == 'image' and not block.get('hidden') and block.get('url'):
                    cover_image = block.get('url')
                    break
                    
        if cover_image:
            if cover_image.startswith('./'):
                cover_image = SITE_URL.rstrip('/') + '/' + cover_image.lstrip('./')
            elif not cover_image.startswith('http'):
                cover_image = SITE_URL.rstrip('/') + '/' + cover_image.lstrip('/')

        # ИСПРАВЛЕНИЕ: Теперь бот формирует ссылку строго на страницу news.html с ID конкретной новости
        news_url = f"{SITE_URL}news.html#{news_id}" if news_id else f"{SITE_URL}news.html"
        
        return title, lead, cover_image, news_url
    except Exception as e:
        print(f"Ошибка при запросе к API сайта: {e}")
        return None, None, None, None

def download_image(image_url, save_path="temp_news_img.jpg"):
    """Скачивает картинку, обходя страницу проверки на вирусы от Google Drive"""
    try:
        session = requests.Session()
        
        if "drive.google.com" in image_url:
            match = re.search(r'id=([a-zA-Z0-9_-]+)', image_url)
            if match:
                file_id = match.group(1)
                download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
                response = session.get(download_url, stream=True, timeout=15)
                
                for key, value in response.cookies.items():
                    if key.startswith('download_warning'):
                        print("Обход защиты Google Drive от вирусов...")
                        response = session.get(download_url + f"&confirm={value}", stream=True, timeout=15)
                        break
            else:
                response = session.get(image_url, stream=True, timeout=15)
        else:
            response = session.get(image_url, stream=True, timeout=15)
            
        content_type = response.headers.get('Content-Type', '')
        if 'text/html' in content_type:
            print(f"[!] Гугл не отдал картинку. По ссылке находится веб-страница (HTML).")
            return None

        if response.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
                    
            file_size = os.path.getsize(save_path)
            if file_size < 2000:  
                print(f"[!] Скачанный файл слишком мал ({file_size} байт). Это не изображение.")
                return None
                
            print(f"Картинка успешно скачана (размер: {file_size // 1024} КБ)")
            return save_path
    except Exception as e:
        print(f"Ошибка скачивания картинки: {e}")
    return None

def upload_photo_to_vk(image_path):
    group_id = str(OWNER_ID).lstrip('-')
    
    url_server = requests.get(
        "https://api.vk.com/method/photos.getOwnerWallUploadServer",
        params={
            'group_id': str(OWNER_ID).lstrip('-'),
            'access_token': TOKEN,
            'v': API_VERSION
        }
    ).json()
    
    if 'response' not in url_server:
        print(f"Ошибка сервера загрузки ВК: {url_server}")
        return None
        
    upload_url = url_server['response']['upload_url']
    
    with open(image_path, 'rb') as photo_file:
        files = {'photo': ('cover.jpg', photo_file, 'image/jpeg')}
        upload_response = requests.post(upload_url, files=files).json()
        
    if not upload_response.get('photo') or upload_response.get('photo') == '[]':
        print("[!] ВК сервер отклонил файл. (вернулся пустой массив)")
        return None
        
    save_response = requests.post(
        "https://api.vk.com/method/photos.saveWallPhoto",
        data={
            'group_id': group_id,
            'server': upload_response['server'],
            'photo': upload_response['photo'],
            'hash': upload_response['hash'],
            'access_token': TOKEN,
            'v': API_VERSION
        }
    ).json()
    
    if 'response' in save_response:
        photo_data = save_response['response'][0]
        return f"photo{photo_data['owner_id']}_{photo_data['id']}"
    
    print(f"Ошибка сохранения фото в ВК: {save_response}")
    return None

def auto_post_latest_news():
    print("Получаем свежую новость с бэкенда сайта...")
    title, lead, image_url, news_url = fetch_latest_news_from_api()
    
    if not title:
        print("Не удалось получить новость.")
        return

    message = f"🔥 {title}\n\n{lead}\n\nЧитать подробнее на сайте: {news_url}"
    attachments = []
    
    if image_url:
        print(f"Скачиваем обложку: {image_url}")
        local_img = download_image(image_url)
        if local_img:
            print("Загружаем картинку в ВК...")
            photo_att = upload_photo_to_vk(local_img)
            if photo_att:
                attachments.append(photo_att)
            if os.path.exists(local_img):
                os.remove(local_img)

    url = "https://api.vk.com/method/wall.post"
    payload = {
        'owner_id': OWNER_ID,
        'from_group': 1,
        'message': message,
        'attachments': ','.join(attachments) if attachments else '',
        'lat': 54.7335,
        'long': 20.5284,
        'place_str': 'Западный филиал РАНХиГС, ул. Артиллерийская, 62',
        'access_token': TOKEN,
        'v': API_VERSION
    }
    
    response = requests.post(url, data=payload)
    result = response.json()
    
    if 'response' in result:
        print(f"Успешно! Пост с картинкой и уникальной ссылкой опубликован. ID записи: {result['response']['post_id']}")
    else:
        print(f"Ошибка публикации в ВК: {result}")

if __name__ == "__main__":
    auto_post_latest_news()
