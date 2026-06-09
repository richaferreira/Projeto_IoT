import os
import json
import re

content_file = "/home/ubuntu/Projeto_IoT/docs/slides_content.md"
slides_dir = "/home/ubuntu/Projeto_IoT/docs/slides"

with open(content_file, "r", encoding="utf-8") as f:
    content = f.read()

slides_text = re.split(r"## Slide \d+:", content)[1:]

template = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .slide-container {
            width: 1280px; min-height: 720px;
            background: #E3FAFC;
            font-family: 'Inter', sans-serif;
            color: #495057;
            display: flex; flex-direction: column;
            padding: 64px;
            overflow: hidden;
        }
        h1, h2 { color: #0B7285; font-weight: 800; }
        .title-slide {
            justify-content: center; align-items: center; text-align: center;
        }
        .title-slide h1 { font-size: 64px; margin-bottom: 24px; }
        .title-slide h2 { font-size: 32px; color: #20C997; margin-bottom: 48px; }
        .title-slide p { font-size: 20px; margin-bottom: 16px; }
        
        .content-slide h1 { font-size: 32px; margin-bottom: 32px; border-bottom: 2px solid #20C997; padding-bottom: 16px; }
        .card {
            background: white;
            border-radius: 12px;
            border: 1px solid #dee2e6;
            padding: 32px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            flex: 1;
            font-size: 20px;
            line-height: 1.6;
        }
        .card p { margin-bottom: 24px; }
        .card strong { color: #0B7285; }
    </style>
</head>
<body>
    <div class="slide-container {CLASS}">
        {CONTENT}
    </div>
</body>
</html>"""

for i, slide_text in enumerate(slides_text):
    slide_id = f"slide_{i+1}"
    lines = [l.strip() for l in slide_text.split("\n") if l.strip() and not l.startswith("---")]
    
    if i == 0: # Capa
        title = lines[0].replace("**Título:**", "").strip()
        subtitle = lines[1].replace("**Subtítulo:**", "").strip()
        authors = lines[2].replace("**Autores:**", "").strip()
        date = lines[3].replace("**Data:**", "").strip()
        
        html_content = f"<h1>{title}</h1>\n<h2>{subtitle}</h2>\n<p><strong>Autores:</strong> {authors}</p>\n<p><strong>Data:</strong> {date}</p>"
        html = template.replace("{CLASS}", "title-slide").replace("{CONTENT}", html_content)
    else:
        title = lines[0].replace("**Título:**", "").strip()
        body_html = ""
        for line in lines[1:]:
            line = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", line)
            body_html += f"<p>{line}</p>\n"
            
        html_content = f"<h1>{title}</h1>\n<div class='card'>\n{body_html}</div>"
        html = template.replace("{CLASS}", "content-slide").replace("{CONTENT}", html_content)
        
    with open(os.path.join(slides_dir, f"{slide_id}.html"), "w", encoding="utf-8") as f:
        f.write(html)

print("Slides HTML gerados.")
