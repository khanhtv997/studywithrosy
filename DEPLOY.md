# Triển khai EduPath lên server Ubuntu (Docker + PostgreSQL cài trên máy)

App chạy trong **một container**. Container này phục vụ cả giao diện lẫn API (`/api`) trên cùng một cổng và kết nối tới PostgreSQL cài sẵn trên Ubuntu (không chạy trong Docker). Reverse proxy đang có trên server (nginx, Caddy, Traefik…) đưa app ra tên miền kèm HTTPS.

```
Trình duyệt ──HTTPS──> reverse proxy ──> 127.0.0.1:3001 (container eduassess) ──> PostgreSQL trên Ubuntu :5432
```

Các tệp liên quan: `Dockerfile`, `docker-compose.yml`, `.env.production.example`.

## 0. Yêu cầu

- Ubuntu đã có Docker Engine và Docker Compose v2 (`docker compose version`).
- PostgreSQL 14 trở lên cài trên máy (`psql --version`).
- Một tên miền trỏ về server, nếu muốn dùng HTTPS.
- Cổng 3001 còn trống trên `127.0.0.1`. Nếu đã có service khác dùng, đổi `EDUASSESS_PORT` (xem bước 3).

## 1. Chuẩn bị PostgreSQL

### 1.1 Tạo user và database

```bash
sudo -u postgres psql
```
```sql
CREATE ROLE eduassess LOGIN PASSWORD 'mat-khau-manh-cua-ban';
CREATE DATABASE eduassess OWNER eduassess;
\q
```
Bảng được app tự tạo khi khởi động (migration chạy tự động), không cần chạy SQL nào khác.

### 1.2 Cho container kết nối vào PostgreSQL

Container nằm trong mạng Docker (thường là dải `172.16.0.0/12`), nên PostgreSQL phải nhận kết nối từ dải này. Mặc định PostgreSQL chỉ nghe trên `localhost`.

Tìm thư mục cấu hình: `sudo -u postgres psql -c "SHOW config_file;"` (thường là `/etc/postgresql/<phiên bản>/main/`).

**`postgresql.conf`**: cho PostgreSQL nghe trên mọi địa chỉ. Người ngoài vẫn bị chặn nhờ `pg_hba.conf` và tường lửa ở dưới.
```conf
listen_addresses = '*'
```

**`pg_hba.conf`**: chỉ cho mạng Docker vào đúng database này. Thêm dòng sau vào cuối tệp:
```conf
host    eduassess    eduassess    172.16.0.0/12    scram-sha-256
```

Khởi động lại PostgreSQL:
```bash
sudo systemctl restart postgresql
```

**Tường lửa:** nếu dùng `ufw`, cho phép mạng Docker và **không** mở 5432 ra Internet:
```bash
sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp
sudo ufw status   # không được có dòng "5432 ALLOW Anywhere"
```
Nếu server nằm trên cloud, kiểm tra thêm security group / firewall của nhà cung cấp, đảm bảo cổng 5432 không mở ra ngoài.

> Nếu Docker trên máy dùng dải mạng khác (ví dụ `192.168.x.x`), xem bằng `docker network inspect bridge | grep Subnet`, rồi sửa dải trong `pg_hba.conf` và `ufw` cho khớp.

## 2. Đưa mã nguồn lên server

Chọn một trong hai cách:

- **Dùng Git** (khuyên dùng): đẩy mã lên kho Git riêng, rồi trên server chạy `git clone <repo> /opt/eduassess`.
- **Chép trực tiếp:** nén thư mục dự án, **bỏ** `node_modules`, `dist`, `data` và các tệp `.env`, rồi chép lên server:
  ```bash
  scp eduassess.zip user@server:/opt/
  ssh user@server "cd /opt && unzip eduassess.zip -d eduassess"
  ```

Các bước dưới đây chạy trong thư mục `/opt/eduassess` trên server.

## 3. Cấu hình

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -base64 48   # chạy 2 lần: một cho AUTH_JWT_SECRET, một cho AI_KEYS_SECRET
nano .env.production
```

| Biến | Giá trị |
| --- | --- |
| `DATABASE_URL` | `postgresql://eduassess:<mật khẩu>@host.docker.internal:5432/eduassess`. Ký tự đặc biệt trong mật khẩu phải được mã hoá URL (`@` → `%40`, `#` → `%23`). |
| `AUTH_JWT_SECRET` | Chuỗi ngẫu nhiên ở trên. Đổi giá trị này sẽ đăng xuất mọi người. |
| `AI_KEYS_SECRET` | Chuỗi ngẫu nhiên khác. **Giữ cố định:** đổi giá trị này thì các khoá Gemini đã lưu sẽ không đọc được nữa. |
| `SEED_ADMIN_PASSWORD` | Mật khẩu ban đầu của tài khoản `admin`. Tài khoản này chỉ được tạo khi bảng tài khoản còn trống. |
| `SEED_DEMO_DATA` | `false`. |
| `GEMINI_MODEL` | Giữ mặc định. Khoá API được nhập trong app, không đặt ở đây. |

Nếu cổng 3001 đã có service khác dùng, đặt cổng khác cho container: tạo tệp `.env` cạnh `docker-compose.yml` với nội dung `EDUASSESS_PORT=3005`. Docker Compose tự đọc tệp này.

## 4. Build và chạy

```bash
docker compose up -d --build
docker compose ps                     # STATUS phải là "healthy" sau khoảng 30–60 giây
docker compose logs -f eduassess      # có dòng "EduPath API: ..." là đã chạy
curl http://127.0.0.1:3001/api/health # {"ok":true}
```

Lần build đầu mất vài phút. Image khoảng 700 MB.

## 5. Reverse proxy và HTTPS

App yêu cầu reverse proxy:
- Chuyển request tới `http://127.0.0.1:3001`.
- **Cho phép body tới 30 MB** (tải ảnh/PDF đề để OCR).
- **Chờ phản hồi tới 300 giây** (đọc đề dài bằng AI có thể mất 1–3 phút).

### nginx cài trên máy

`/etc/nginx/sites-available/eduassess`:
```nginx
server {
    listen 80;
    server_name eduassess.ten-mien-cua-ban.vn;

    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/eduassess /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d eduassess.ten-mien-cua-ban.vn   # cấp HTTPS miễn phí (Let's Encrypt)
```

### Reverse proxy chạy trong Docker (nginx-proxy, Traefik, Caddy…)

Đưa `eduassess` vào cùng mạng Docker với proxy rồi trỏ tới `http://eduassess:3001`. Ví dụ, thêm vào `docker-compose.yml`:
```yaml
services:
  eduassess:
    networks: [default, proxy]
networks:
  proxy:
    external: true   # tên mạng mà reverse proxy đang dùng
```
Khi đó có thể bỏ mục `ports:`. Nhớ tăng giới hạn body (30 MB) và thời gian chờ (300 giây) trên proxy.

## 6. Lần đăng nhập đầu

1. Mở `https://eduassess.ten-mien-cua-ban.vn` và đăng nhập `admin` bằng `SEED_ADMIN_PASSWORD`.
2. Menu tài khoản → **Đổi mật khẩu**.
3. Menu **Khoá API AI** → **Thêm khoá**: dán khoá Gemini lấy từ aistudio.google.com rồi bấm **Kiểm tra**.
4. Tạo tài khoản giáo viên ở **Tài khoản**, tạo lớp, rồi nhập học sinh bằng Excel.

### Đăng nhập bằng Google (tuỳ chọn)

Giáo viên mới bấm **Tiếp tục với Google** ở trang đăng nhập. Hệ thống tạo tài khoản **giáo viên ở trạng thái chờ duyệt** và báo cho quản trị viên (chuông thông báo). Quản trị viên vào **Tài khoản** → **Chờ phê duyệt** → **Duyệt** (hoặc **Từ chối**). Sau khi được duyệt, giáo viên đăng nhập lại bằng Google là dùng được ngay.

Tài khoản có sẵn (do admin tạo) mà trùng email Google thì được liên kết luôn, không phải duyệt lại.

Cách bật:

1. Vào https://console.cloud.google.com → tạo (hoặc chọn) một project.
2. **APIs & Services → OAuth consent screen**: chọn **External**, điền tên app (EduPath), email hỗ trợ, rồi **Publish app**. Chỉ cần các quyền mặc định (email, profile).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `https://studywithrosy.site` (thêm `http://localhost:3000` nếu muốn thử ở máy)
   - Không cần Redirect URI.
4. Copy **Client ID** (dạng `xxxx.apps.googleusercontent.com`) và thêm vào `.env.production`:
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```
5. `docker compose up -d` để nạp lại cấu hình (không cần build lại). Nút Google sẽ hiện ở trang đăng nhập.

Chỉ cần Client ID, **không** dùng Client secret. Server tự kiểm tra chữ ký của Google cho mỗi lần đăng nhập.

## 7. Chuyển dữ liệu từ máy đang chạy thử (tuỳ chọn)

Trên máy cũ:
```bash
pg_dump --no-owner --no-acl -Fc -d "postgresql://postgres:<mk>@127.0.0.1:5432/eduassess" -f eduassess.dump
```
Chép tệp lên server rồi khôi phục **trước khi** chạy container lần đầu (database phải còn trống):
```bash
pg_restore --no-owner --role=eduassess -d "postgresql://eduassess:<mk>@127.0.0.1:5432/eduassess" eduassess.dump
```
Khoá Gemini trong dữ liệu cũ được mã hoá bằng secret của máy cũ. Nếu `AI_KEYS_SECRET` trên server khác secret đó, chỉ cần vào **Khoá API AI** xoá khoá cũ và thêm lại.

## 8. Cập nhật phiên bản mới

```bash
cd /opt/eduassess
git pull                       # hoặc chép mã mới đè lên
docker compose up -d --build   # build image mới, thay container; migration tự chạy
docker image prune -f          # xoá image cũ không dùng
```
App ngừng phục vụ vài giây trong lúc thay container.

## 9. Sao lưu

Sao lưu database mỗi ngày lúc 2 giờ sáng và giữ 14 bản gần nhất (`sudo crontab -e`):
```cron
0 2 * * * mkdir -p /var/backups/eduassess && sudo -u postgres pg_dump -Fc eduassess > /var/backups/eduassess/eduassess-$(date +\%F).dump && find /var/backups/eduassess -name '*.dump' -mtime +14 -delete
```
Lưu thêm `.env.production` ở nơi an toàn. Thiếu `AI_KEYS_SECRET` thì khoá AI trong bản sao lưu không dùng được.

## 10. Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| Log có `ECONNREFUSED ...:5432` | PostgreSQL chưa nghe ngoài localhost: kiểm tra `listen_addresses`, rồi khởi động lại PostgreSQL. |
| Log có `no pg_hba.conf entry` | Thêm hoặc sửa dòng trong `pg_hba.conf` cho đúng dải mạng Docker, rồi khởi động lại PostgreSQL. |
| `password authentication failed` | Sai mật khẩu, hoặc ký tự đặc biệt chưa được mã hoá URL trong `DATABASE_URL`. |
| Container không "healthy" | Xem `docker compose logs eduassess`. |
| Tải đề báo lỗi 413 | Tăng `client_max_body_size` trên proxy lên 30 MB. |
| Đọc đề bằng AI báo lỗi 504 / quá thời gian | Tăng `proxy_read_timeout` lên 300 giây. |
| "Chưa có khoá API AI nào dùng được" | Thêm hoặc kiểm tra khoá ở màn **Khoá API AI**. |
| Khoá AI hiện lỗi giải mã sau khi chuyển server | `AI_KEYS_SECRET` khác máy cũ: xoá khoá và thêm lại. |
