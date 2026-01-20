# クイックスタートガイド

## インストール手順（macOS）

### 1. サーバーを起動

```bash
cd /tmp/stereo-beamforming
python3 -m http.server 8000
```

ターミナルに以下が表示されたら成功:
```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

### 2. Chrome で開く

以下のいずれかのURLにアクセス:
- **フル機能版**: http://localhost:8000/index.html
- **シンプル版**: http://localhost:8000/test.html

### 3. マイク許可

ブラウザがマイクへのアクセスを要求するので「許可」をクリック

### 4. テスト

1. **START ボタン** をクリック
2. マイクが動作開始
3. 4つの処理方法を切り替えて試す
4. **マイク間隔スライダー** で 15-25cm に調整
5. レベルメーターで入出力を確認

---

## 4つの処理方法

| 方法 | 説明 | 用途 |
|-----|------|------|
| **Mid/Side** | L+R成分を強調、L-R成分を減衰 | 最も軽量、テレビ会議推奨 |
| **Paracardioid** | 複数指向性パターンを合成 | 滑らかな指向性調整 |
| **TDOA** | 時間差遅延を利用 | マイク間隔が既知の場合 |
| **Frequency** | 帯域ごとに異なる処理 | 周波数特性を活かしたい場合 |

---

## 仮想ケーブル設定（Zoom/Teams用）

### 1. 仮想オーディオデバイスをインストール

```bash
# BlackHole をインストール
brew install blackhole-2ch
```

### 2. Chrome の出力を仮想ケーブルに設定

Chrome 設定 → サウンド → 出力 → "BlackHole 2ch" を選択

### 3. Zoom/Teams の入力デバイスを変更

Zoom/Teams の設定 → オーディオ → マイク → "BlackHole 2ch" を選択

### 4. テレビ会議開始

これで周囲の音が抑制されたマイク音声が配信されます

---

## パラメータ調整

### マイク間隔（重要）
- PCの実際のマイク間隔を測定
- スライダーで設定
- 例: MacBook Pro = 約 20cm

###処理強度
- **Mid/Side**: Side減衰強度 (0.5～1.0推奨)
- **Paracardioid**: 指向性強度 (0.7～1.0推奨)
- **TDOA**: 固定値（マイク間隔で調整）
- **Frequency**: バンド数 (4～6推奨)

---

## トラブルシューティング

### マイクが見つからない
```bash
# マイクの確認
system_profiler SPAudioDataType | grep -A2 "Microphone"
```

### 音が出ない
1. Chrome 設定 > サウンド で出力デバイスを確認
2. システムボリュームを確認
3. F12 → コンソールでエラーを確認

### CPU が高い
- シンプル版（test.html）を使用
- Mid/Side 方法のみ使用
- ブラウザを再起動

---

## ファイル説明

| ファイル | 説明 |
|---------|------|
| `index.html` | フル機能版（推奨） |
| `test.html` | シンプル版（軽量） |
| `beamforming-processor.js` | 処理エンジン |
| `README.md` | 詳細ドキュメント |

---

## 次のステップ

1. **基本テスト**: test.html で各方法を試す
2. **詳細調整**: index.html でパラメータを調整
3. **運用設定**: 仮想ケーブルで Zoom/Teams に接続
4. **最適化**: CPU負荷を監視しながら方法を選択

---

## 参考資料

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [ビームフォーミング（Wikipedia）](https://ja.wikipedia.org/wiki/ビームフォーミング)

---

**質問・問題報告**: Chrome DevTools (F12) のコンソールでエラーを確認してください
