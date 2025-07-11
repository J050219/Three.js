# 使用者互動 3D 建模工具

這是一個使用 [Three.js](https://threejs.org/) 製作的 Web 應用程式，讓使用者可以自訂 3D 形狀（立方體、球體、不規則圖形），設定尺寸、顏色與簍空區域，並即時在畫面中生成對應模型。

---

## 安裝必要套件
```bash
npm install three
```
使用 CSG（簍空）功能
```bash
npm install three-csg-ts
```

## 功能特色

- 支援生成以下三種圖形：
  - 立方體（Box）
  - 球體（Sphere）
  - 不規則形狀（Custom）
- 可自行設定尺寸（寬、高、深）
- 可指定顏色（HEX 色碼）
- 支援簍空（勾選後可設定孔洞尺寸）
- 加入光照系統-明亮差別
- 模型自動旋轉展示
- 自動清除上一個模型避免重疊

## 專案結構
```
Animation System/
├── index.html # 主畫面 HTML
├── main.js # Three.js 主程式
├── README.md # 專案說明文件
├── /node_modules/ # 套件安裝目錄
└── package.json # npm 套件設定
```

## 使用方法
1. 開啟網頁後，畫面右側可輸入以下參數：

    選擇圖形類型（立方體 / 球體 / 不規則圖形）

    設定寬度、高度、深度

    選擇顏色（HEX 格式，如 #ff0000）

    是否簍空（可輸入孔洞的寬高）
2. 點擊「產生」按鈕，即可生成對應 3D 模型。
3. 使用者可以手動旋轉模型，方便觀察各個角度。
4. 若再次點擊「產生」，將移除前一個模型並生成新模型。


