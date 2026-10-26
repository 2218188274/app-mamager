from pathlib import Path
from PIL import Image, ImageDraw
r=Path(__file__).resolve().parents[1]; brand=r/'assets/brand'; brand.mkdir(parents=True,exist_ok=True)
purple='#7054C8'; scale=12; n=108*scale
def drawing(background):
 im=Image.new('RGBA',(n,n),background);d=ImageDraw.Draw(im)
 def box(v):return tuple(int(x*scale) for x in v)
 d.rounded_rectangle(box((23,32,79,73)),radius=12*scale,fill='white')
 d.polygon([box(p) for p in [(25,63),(25,84),(44,70)]],fill='white')
 d.rounded_rectangle(box((35,45,66,49)),radius=2*scale,fill=purple)
 d.rounded_rectangle(box((35,56,56,60)),radius=2*scale,fill=purple)
 d.polygon([box(p) for p in [(79,19),(83,29),(93,33),(83,37),(79,47),(75,37),(65,33),(75,29)]],fill='white')
 return im
icon=drawing(purple);icon.resize((1024,1024),Image.Resampling.LANCZOS).convert('RGB').save(brand/'icon.png')
drawing((0,0,0,0)).resize((1024,1024),Image.Resampling.LANCZOS).save(brand/'adaptive-foreground.png')
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
 for name in ['ic_launcher','ic_launcher_round']:
  icon.resize((size,size),Image.Resampling.LANCZOS).save(r/f'android/app/src/main/res/mipmap-{density}/{name}.webp',lossless=True)
icon.resize((1024,1024),Image.Resampling.LANCZOS).convert('RGB').save(r/'ios/app/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png')
res=r/'android/app/src/main/res';(res/'mipmap-anydpi-v26').mkdir(exist_ok=True)
foreground='''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
<path android:fillColor="#FFFFFF" android:pathData="M35,32H67Q79,32 79,44V61Q79,73 67,73H41L25,84V69Q23,66 23,61V44Q23,32 35,32Z"/>
<path android:fillColor="#7054C8" android:pathData="M37,45H64Q66,45 66,47Q66,49 64,49H37Q35,49 35,47Q35,45 37,45ZM37,56H54Q56,56 56,58Q56,60 54,60H37Q35,60 35,58Q35,56 37,56Z"/>
<path android:fillColor="#FFFFFF" android:pathData="M79,19L83,29L93,33L83,37L79,47L75,37L65,33L75,29Z"/>
</vector>'''
(res/'drawable/chatq_launcher_foreground.xml').write_text(foreground,encoding='utf-8')
(res/'drawable/chatq_launcher_background.xml').write_text('<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#7054C8"/></shape>',encoding='utf-8')
adaptive='<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/chatq_launcher_background"/><foreground android:drawable="@drawable/chatq_launcher_foreground"/><monochrome android:drawable="@drawable/chatq_launcher_foreground"/></adaptive-icon>'
for name in ['ic_launcher','ic_launcher_round']:(res/f'mipmap-anydpi-v26/{name}.xml').write_text(adaptive,encoding='utf-8')
(brand/'README.md').write_text('聊商品牌图标：品牌紫 #7054C8、对话气泡与灵感星。原创几何图形，由 scripts/generate-brand-icons.py 的几何参数绘制；PNG 用于 Expo/iOS 与旧 Android，多层向量用于 Android 自适应图标。\n',encoding='utf-8')
print('Brand icons generated for legacy, adaptive, monochrome, Expo and iOS')
