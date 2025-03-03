const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8081;

// Thư mục chứa file upload
const uploadFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder);
}

// Cấu hình Multer để lưu file với tên duy nhất (thêm timestamp)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadFolder);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Sử dụng thư mục public để phục vụ file tĩnh (index.html,...)
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trả về trang giao diện chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route upload file (cho phép upload nhiều file)
app.post('/upload', upload.array('files'), (req, res) => {
    res.json({ message: 'Upload thành công!' });
});

// Route download file đã xử lý: gộp nội dung tất cả file và loại bỏ dòng trùng lặp
app.get('/download', (req, res) => {
    fs.readdir(uploadFolder, (err, files) => {
        if (err) return res.status(500).send('Lỗi khi đọc thư mục upload');
        let allText = '';
        let pending = files.length;
        if (!pending) {
            return res.status(400).send('Không có file nào để xử lý!');
        }
        files.forEach(file => {
            fs.readFile(path.join(uploadFolder, file), 'utf8', (err, data) => {
                if (!err) {
                    allText += data + "\n";
                }
                pending--;
                if (pending === 0) {
                    let lines = allText.split(/\r?\n/).filter(line => line.trim() !== '');
                    let uniqueLines = [...new Set(lines)];
                    let newContent = uniqueLines.join('\n');
                    res.setHeader('Content-Disposition', 'attachment; filename=unique.txt');
                    res.setHeader('Content-Type', 'text/plain');
                    res.send(newContent);
                }
            });
        });
    });
});

// Route lấy danh sách các file đã upload
app.get('/files', (req, res) => {
    fs.readdir(uploadFolder, (err, files) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi đọc thư mục upload' });
        res.json({ files });
    });
});

// Route tải file cá nhân
app.get('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadFolder, filename);
    res.download(filePath);
});

// Route xóa file theo tên
app.delete('/delete/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadFolder, filename);
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi xóa file' });
        res.json({ message: `Đã xóa file ${filename}` });
    });
});

app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});
