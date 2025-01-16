import os
from PIL import Image

# 指定slides目錄路徑
slides_dir = 'slides'

# 取得slides目錄下所有PNG檔案
png_files = [f for f in os.listdir(slides_dir) if f.endswith('.png')]

# 轉換每個PNG檔案為WebP格式
for png_file in png_files:
    # 組合完整的檔案路徑
    png_path = os.path.join(slides_dir, png_file)
    
    # 開啟PNG圖片
    img = Image.open(png_path)
    
    # 產生新的WebP檔名
    webp_file = os.path.splitext(png_file)[0] + '.webp'
    webp_path = os.path.join(slides_dir, webp_file)
    
    # 儲存為WebP格式
    img.save(webp_path, 'WEBP')
    
    print(f'已將 {png_file} 轉換為 {webp_file}')
