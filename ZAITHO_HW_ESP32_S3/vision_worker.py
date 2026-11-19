import base64
import json
import os
import cv2
import numpy as np
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ultralytics import YOLO

PORT = int(os.environ.get("ZAITHO_VISION_PORT", "3004"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VISION_DB_FILE = os.path.join(BASE_DIR, "zaitho_vision_db.json")

print("👁️ Cargando YOLOv8n + OpenCV para reconocimiento rápido de rostros, plantas y objetos...", flush=True)
yolo_model = YOLO(os.path.join(BASE_DIR, "yolov8n.pt"))
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
LAST_GOOD_ROTATION = 0  # 0, 90, 180, 270 grados CW
print(f"✅ Vision Worker listo en http://127.0.0.1:{PORT}/analyze", flush=True)

COCO_ES = {
    "person": "persona",
    "potted plant": "planta en maceta",
    "bottle": "botella",
    "cup": "taza",
    "cell phone": "celular",
    "laptop": "computador portátil",
    "keyboard": "teclado",
    "mouse": "ratón",
    "book": "libro",
    "chair": "silla",
    "couch": "sofá",
    "bed": "cama",
    "dining table": "mesa",
    "tv": "televisor",
    "dog": "perro",
    "cat": "gato",
    "bird": "pájaro",
    "car": "auto",
    "backpack": "mochila",
    "clock": "reloj",
    "vase": "florero",
    "apple": "manzana",
    "banana": "plátano",
    "orange": "naranja",
    "remote": "control remoto",
}


def load_db():
    if os.path.exists(VISION_DB_FILE):
        try:
            with open(VISION_DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"entries": []}


def save_db(db):
    with open(VISION_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def rotate_image(img, rot_deg):
    if rot_deg == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if rot_deg == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if rot_deg == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def extract_feature(img_bgr, box=None):
    h, w = img_bgr.shape[:2]
    if box is not None:
        x1, y1, x2, y2 = [max(0, int(v)) for v in box]
        crop = img_bgr[min(y1, h - 1):min(y2, h), min(x1, w - 1):min(x2, w)]
        if crop.size == 0:
            crop = img_bgr
    else:
        crop = img_bgr[int(h * 0.15):int(h * 0.85), int(w * 0.15):int(w * 0.85)]
        if crop.size == 0:
            crop = img_bgr

    resized_color = cv2.resize(crop, (64, 64))
    hsv = cv2.cvtColor(resized_color, cv2.COLOR_BGR2HSV)
    hists = []
    for gy in range(2):
        for gx in range(2):
            cell = hsv[gy * 32:(gy + 1) * 32, gx * 32:(gx + 1) * 32]
            ch = cv2.calcHist([cell], [0, 1], None, [12, 12], [0, 180, 0, 256]).flatten()
            ch = ch / (np.linalg.norm(ch) + 1e-8)
            hists.append(ch)
    hist_vec = np.concatenate(hists)
    hist_vec = hist_vec / (np.linalg.norm(hist_vec) + 1e-8)

    gray = cv2.resize(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), (24, 24))
    gray = clahe.apply(gray).astype(np.float32).flatten()
    gray = gray - np.mean(gray)
    gray = gray / (np.linalg.norm(gray) + 1e-8)

    vec = np.concatenate([hist_vec * 0.45, gray * 0.55])
    vec = vec / (np.linalg.norm(vec) + 1e-8)
    return vec.tolist()


def cosine_sim(a, b):
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    if va.shape != vb.shape:
        return 0.0
    return float(np.dot(va, vb) / ((np.linalg.norm(va) * np.linalg.norm(vb)) + 1e-8))


def match_in_db(vec, db, category="auto"):
    best_match = None
    best_score = 0.0
    for entry in db.get("entries", []):
        if category != "auto" and entry.get("category") != category:
            continue
        score = cosine_sim(vec, entry["vec"])
        if score > best_score:
            best_score = score
            best_match = entry
    return best_match, best_score


def decode_image(body):
    b64 = body.get("imageBase64", "")
    if b64:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    img_path = body.get("path", "")
    if img_path and os.path.exists(img_path):
        return cv2.imread(img_path)
    return None


def detect_face_with_auto_rotation(img):
    """
    Detecta rostro probando primero la última rotación exitosa (0, 270, 90, 180)
    para compensar cámaras frontales Android montadas en horizontal.
    """
    global LAST_GOOD_ROTATION
    candidates = [LAST_GOOD_ROTATION] + [r for r in (0, 270, 90, 180) if r != LAST_GOOD_ROTATION]

    for rot in candidates:
        test_img = rotate_image(img, rot)
        h, w = test_img.shape[:2]
        gray = clahe.apply(cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY))
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=4, minSize=(32, 32))
        if len(faces) > 0:
            LAST_GOOD_ROTATION = rot
            fx, fy, fw, fh = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
            cx_ratio = (fx + fw * 0.5) / max(w, 1)
            cy_ratio = (fy + fh * 0.5) / max(h, 1)
            w_ratio = fw / max(w, 1)
            face_pos = "left" if cx_ratio < 0.36 else ("right" if cx_ratio > 0.64 else "center")
            face_dist = "far" if w_ratio < 0.19 else ("close" if w_ratio > 0.42 else "ok")
            norm_box = [
                round(fx / max(w, 1), 3),
                round(fy / max(h, 1), 3),
                round((fx + fw) / max(w, 1), 3),
                round((fy + fh) / max(h, 1), 3),
            ]
            return test_img, [fx, fy, fx + fw, fy + fh], face_pos, face_dist, int(len(faces)), norm_box, round(cx_ratio, 3), round(cy_ratio, 3)

    base_img = rotate_image(img, LAST_GOOD_ROTATION)
    return base_img, None, "none", "ok", 0, None, 0.5, 0.5


class VisionHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/analyze":
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            mode = body.get("mode", "identify")
            label = (body.get("label") or "").strip()
            category = body.get("category", "auto")

            raw_img = decode_image(body)
            if raw_img is None:
                self._reply(400, {"ok": False, "error": "Imagen inválida o vacía"})
                return

            h0, w0 = raw_img.shape[:2]
            if max(h0, w0) > 480:
                scale = 480.0 / max(h0, w0)
                raw_img = cv2.resize(raw_img, (int(w0 * scale), int(h0 * scale)))

            db = load_db()

            # 1. Detección rápida de rostro OpenCV con auto-rotación
            img, face_box, face_pos, face_dist, faces_found, face_norm_box, face_cx, face_cy = detect_face_with_auto_rotation(raw_img)
            img_h, img_w = img.shape[:2]

            # Modo seguimiento facial en tiempo real
            if mode == "follow" and category == "face":
                best_match = None
                best_score = 0.0
                if face_box is not None:
                    vec = extract_feature(img, face_box)
                    best_match, best_score = match_in_db(vec, db, "face")
                recognized = best_match is not None and best_score >= 0.78
                self._reply(200, {
                    "ok": True,
                    "facesFound": faces_found,
                    "facePosition": face_pos,
                    "faceDistance": face_dist,
                    "faceBox": face_norm_box,
                    "faceCx": face_cx,
                    "faceCy": face_cy,
                    "recognized": recognized,
                    "matchedLabel": best_match["label"] if recognized else None,
                    "similarity": round(best_score, 3),
                })
                return

            # 2. Detección YOLO de objetos y obstáculos
            results = yolo_model(img, verbose=False, conf=0.32, imgsz=320)
            detections = []
            best_plant_box = None
            best_person_box = None
            best_any_box = None

            for r in results:
                for b in r.boxes:
                    cls_name = r.names[int(b.cls[0])]
                    conf = float(b.conf[0])
                    xyxy = b.xyxy[0].tolist()
                    x1, y1, x2, y2 = xyxy
                    cx_ratio = ((x1 + x2) * 0.5) / max(img_w, 1)
                    area_ratio = ((x2 - x1) * (y2 - y1)) / max(img_w * img_h, 1)
                    pos = "left" if cx_ratio < 0.36 else ("right" if cx_ratio > 0.64 else "center")
                    is_close = bool(area_ratio > 0.16 or (y2 / max(img_h, 1)) > 0.78)
                    es_name = COCO_ES.get(cls_name, cls_name)

                    crop_vec = extract_feature(img, xyxy)
                    m_entry, m_score = match_in_db(crop_vec, db, "auto")
                    is_known = m_entry is not None and m_score >= 0.78

                    detections.append({
                        "label": cls_name,
                        "labelEs": es_name,
                        "customLabel": m_entry["label"] if is_known else None,
                        "known": is_known,
                        "conf": round(conf, 2),
                        "confidence": round(conf, 2),
                        "position": pos,
                        "areaRatio": round(area_ratio, 3),
                        "close": is_close,
                        "box": [round(v, 1) for v in xyxy],
                        "normBox": [
                            round(x1 / max(img_w, 1), 3),
                            round(y1 / max(img_h, 1), 3),
                            round(x2 / max(img_w, 1), 3),
                            round(y2 / max(img_h, 1), 3),
                        ],
                    })
                    if best_any_box is None:
                        best_any_box = xyxy
                    if cls_name == "potted plant" and best_plant_box is None:
                        best_plant_box = xyxy
                    if cls_name == "person" and best_person_box is None:
                        best_person_box = xyxy

            detections.sort(key=lambda d: d["areaRatio"] * d["confidence"], reverse=True)

            # Seleccionar región de interés (si viene box explícita para entrenar un objeto de una caja)
            custom_norm_box = body.get("box")
            if isinstance(custom_norm_box, list) and len(custom_norm_box) == 4:
                roi_box = [
                    custom_norm_box[0] * img_w,
                    custom_norm_box[1] * img_h,
                    custom_norm_box[2] * img_w,
                    custom_norm_box[3] * img_h,
                ]
            else:
                roi_box = face_box if (category == "face" or (category == "auto" and face_box is not None)) else (
                    best_plant_box if category == "plant" else (best_person_box or best_any_box)
                )
            vec = extract_feature(img, roi_box)

            if mode == "remember" and label:
                inferred_cat = category if category != "auto" else ("face" if face_box is not None else ("plant" if best_plant_box is not None else "object"))
                db["entries"].insert(0, {
                    "label": label,
                    "category": inferred_cat,
                    "vec": vec,
                })
                db["entries"] = db["entries"][:100]
                save_db(db)
                self._reply(200, {
                    "ok": True,
                    "saved": True,
                    "label": label,
                    "category": inferred_cat,
                    "facesFound": faces_found,
                    "facePosition": face_pos,
                    "faceDistance": face_dist,
                    "faceBox": face_norm_box,
                    "detections": detections[:6],
                })
                return

            best_match, best_score = match_in_db(vec, db, category)
            recognized = best_match is not None and best_score >= 0.78
            self._reply(200, {
                "ok": True,
                "recognized": recognized,
                "matchedLabel": best_match["label"] if recognized else None,
                "matchedCategory": best_match.get("category") if recognized else None,
                "similarity": round(best_score, 3),
                "facesFound": faces_found,
                "facePosition": face_pos,
                "faceDistance": face_dist,
                "faceBox": face_norm_box,
                "faceCx": face_cx,
                "faceCy": face_cy,
                "detections": detections[:8],
            })
        except Exception as e:
            self._reply(500, {"ok": False, "error": str(e)})

    def _reply(self, code, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), VisionHandler)
    server.serve_forever()
