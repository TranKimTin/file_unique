const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8081;

// Các thư mục lưu file cho 2 loại
const uploadFolder = path.join(__dirname, 'uploads');
const cat1Folder = path.join(uploadFolder, 'category1');
const cat2Folder = path.join(uploadFolder, 'category2');

// Tạo các thư mục nếu chưa tồn tại
[uploadFolder, cat1Folder, cat2Folder].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// Hàm tạo storage cho từng loại
function getStorage(folder) {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, folder);
        },
        filename: (req, file, cb) => {
            // Thêm timestamp để tránh trùng lặp tên
            cb(null, Date.now() + '-' + file.originalname);
        }
    });
}

const uploadCat1 = multer({ storage: getStorage(cat1Folder) });
const uploadCat2 = multer({ storage: getStorage(cat2Folder) });

// Sử dụng thư mục public để phục vụ giao diện
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trang giao diện chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route upload file cho Loại 1
app.post('/upload/category1', uploadCat1.array('files'), (req, res) => {
    res.json({ message: 'Upload file cho Loại 1 thành công!' });
});

// Route upload file cho Loại 2
app.post('/upload/category2', uploadCat2.array('files'), (req, res) => {
    res.json({ message: 'Upload file cho Loại 2 thành công!' });
});

// Route tải file riêng theo loại (dùng cho cả 2 loại)
app.get('/file/:category/:filename', (req, res) => {
    const category = req.params.category;
    const filename = req.params.filename;
    let folder = category === 'category1' ? cat1Folder : cat2Folder;
    const filePath = path.join(folder, filename);
    res.download(filePath);
});

// Route lấy danh sách file cho Loại 1
app.get('/files/category1', (req, res) => {
    fs.readdir(cat1Folder, (err, files) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi đọc file loại 1' });
        res.json({ files });
    });
});

// Route lấy danh sách file cho Loại 2
app.get('/files/category2', (req, res) => {
    fs.readdir(cat2Folder, (err, files) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi đọc file loại 2' });
        res.json({ files });
    });
});

// Route xóa file theo loại và tên file
app.delete('/delete/:category/:filename', (req, res) => {
    const category = req.params.category;
    const filename = req.params.filename;
    let folder = category === 'category1' ? cat1Folder : cat2Folder;
    const filePath = path.join(folder, filename);
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: `Lỗi khi xóa file ${filename}` });
        res.json({ message: `Đã xóa file ${filename}` });
    });
});

// Route lọc trùng: trả về file chứa các dòng có trong file Loại 1 nhưng không có trong file Loại 2,
// sau đó chuyển toàn bộ file của Loại 1 sang Loại 2.
app.get('/download/difference', (req, res) => {
    fs.readdir(cat1Folder, (err, filesCat1) => {
        if (err) return res.status(500).send('Lỗi khi đọc file loại 1');
        let cat1Text = '';
        let pending1 = filesCat1.length;
        if (pending1 === 0) {
            // Nếu không có file loại 1, trả về file trống
            res.setHeader('Content-Disposition', 'attachment; filename=difference.txt');
            res.setHeader('Content-Type', 'text/plain');
            res.send('');
            return;
        }
        filesCat1.forEach(file => {
            fs.readFile(path.join(cat1Folder, file), 'utf8', (err, data) => {
                if (!err) {
                    cat1Text += data + "\n";
                }
                pending1--;
                if (pending1 === 0) {
                    fs.readdir(cat2Folder, (err, filesCat2) => {
                        if (err) return res.status(500).send('Lỗi khi đọc file loại 2');
                        let cat2Text = '';
                        let pending2 = filesCat2.length;
                        if (pending2 === 0) {
                            processAndSend(cat1Text, cat2Text);
                        }
                        if (pending2 > 0) {
                            filesCat2.forEach(file => {
                                fs.readFile(path.join(cat2Folder, file), 'utf8', (err, data) => {
                                    if (!err) {
                                        cat2Text += data + "\n";
                                    }
                                    pending2--;
                                    if (pending2 === 0) {
                                        processAndSend(cat1Text, cat2Text);
                                    }
                                });
                            });
                        }
                    });
                }
            });
        });
        // Hàm xử lý nội dung và gửi file về, sau đó chuyển file của Loại 1 sang Loại 2
        function processAndSend(cat1Text, cat2Text) {
            let linesCat1 = new Set(cat1Text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== ''));
            let linesCat2 = new Set(cat2Text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== ''));
            let diff = [...linesCat1].filter(line => !linesCat2.has(line));
            let result = diff.join("\n");
            res.setHeader('Content-Disposition', 'attachment; filename=difference.txt');
            res.setHeader('Content-Type', 'text/plain');
            res.send(result);
            // Sau khi gửi file, chuyển toàn bộ file từ Loại 1 sang Loại 2
            fs.readdir(cat1Folder, (err, filesToMove) => {
                if (err) return console.error('Lỗi khi đọc file để chuyển:', err);
                filesToMove.forEach(file => {
                    const oldPath = path.join(cat1Folder, file);
                    const newPath = path.join(cat2Folder, file);
                    fs.rename(oldPath, newPath, (err) => {
                        if (err) console.error('Lỗi khi chuyển file:', file, err);
                    });
                });
            });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});
