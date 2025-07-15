import onnxruntime as ort
import numpy as np
from PIL import Image

class OVISRecognizer:
    def __init__(self, model_path):
        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def preprocess(self, image: Image.Image):
        image = image.resize((640, 640)).convert("RGB")
        img_np = np.array(image).astype(np.float32) / 255.0
        img_np = np.transpose(img_np, (2, 0, 1))  # HWC to CHW
        img_np = np.expand_dims(img_np, axis=0)
        return img_np

    def predict(self, image: Image.Image) -> str:
        input_tensor = self.preprocess(image)
        outputs = self.session.run([self.output_name], {self.input_name: input_tensor})[0]

        # 👇 根據你的 OVIS 輸出調整這裡（這裡假設是單行文字辨識）
        # outputs shape: (1, seq_len, vocab)
        # 輸出轉換為文字（這裡是假設用 argmax）
        text = ''.join([chr(int(np.argmax(t))) for t in outputs[0]])
        return text
