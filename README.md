# EduAssess

Ứng dụng React/Vite, API NestJS và PostgreSQL cài trên máy. Frontend lấy lớp, học sinh, đề thi và bài nộp từ API; dữ liệu được lưu trong database `eduassess`, không dùng mảng mock của frontend.

## Chạy ứng dụng

1. Cài Node.js 22+ và PostgreSQL, chạy `npm install`.
2. Sao chép `.env.example` thành `.env`, điền `DATABASE_URL` của PostgreSQL trên máy và một `AUTH_JWT_SECRET` ngẫu nhiên dài ít nhất 32 ký tự. Không commit `.env`.
3. Chạy `npm run db:create` nếu database chưa tồn tại.
4. Chạy `npm run dev`. Mở http://localhost:3000. API chạy ở http://localhost:3001/api.

Khi server khởi động mà bảng `users` còn trống, server tự tạo tài khoản quản trị với tên đăng nhập **`admin`** và mật khẩu `SEED_ADMIN_PASSWORD` (mặc định `Admin@123`). Hãy đổi mật khẩu sau lần đăng nhập đầu. Từ tài khoản này, vào màn **Tài khoản & phân quyền** để tạo giáo viên và học sinh.

Đăng nhập bằng **email hoặc tên đăng nhập ngắn** (3–32 ký tự: chữ thường, số, `.`, `_`, `-`, ví dụ `giaovien`). Tài khoản học sinh phải liên kết với một học sinh trong lớp. Quyền được kiểm tra ở API; học sinh chỉ xem dữ liệu của mình và không thấy đáp án hay điểm trước khi giáo viên duyệt.

`SEED_DEMO_DATA=true` nạp dữ liệu mẫu (3 lớp, 6 học sinh, đề, bài nộp và các tài khoản `admin@eduassess.local`, `teacher@eduassess.local`, học sinh mẫu) khi database còn trống; mặc định là `false`. Mật khẩu mẫu chỉ được đọc lúc tạo tài khoản lần đầu.

## Triển khai lên server

Xem [DEPLOY.md](DEPLOY.md): build bằng Docker (`docker compose up -d --build`), kết nối PostgreSQL cài trên Ubuntu, cấu hình reverse proxy kèm HTTPS, cập nhật phiên bản và sao lưu. Ở chế độ production, API phục vụ luôn giao diện đã build (`dist/`) trên cùng một cổng; `GET /api/health` dùng để kiểm tra trạng thái.

## Các trang

Ứng dụng dùng route riêng cho từng màn: `/classes` (danh sách lớp), `/classes/:id` (thông tin và học sinh của một lớp), `/students` (tất cả học sinh, lọc theo lớp bằng `?class=`), `/assessments`, `/grading`, `/analytics`, `/admin/users` và `/student`. Sidebar hiển thị theo vai trò; header và footer được dùng chung qua `src/layouts/AppShell.tsx`. Các trang nằm trong `src/pages/`. Mở lại URL của một trang sau khi đăng nhập sẽ giữ đúng trang đó.

## Nhập học sinh từ Excel

Trang `/students/import` (nút **Nhập từ Excel** ở màn Học sinh và trang chi tiết lớp; `?class=` chọn sẵn lớp):

1. **Tải tệp mẫu** (`GET /api/students/import/template`): cột Họ và tên, Mã học sinh, Email (không bắt buộc), kèm trang hướng dẫn. Tên cột thường gặp khác (Họ tên, Mã HS, SBD, E-mail...) cũng được nhận.
2. **Tải lên** `.xlsx` (tối đa 1.000 dòng, 10 MB). Server đọc tệp bằng `exceljs` (`backend/students/student-import.ts`) và trả bản xem trước (`POST /api/students/import/preview`, không ghi gì). Mỗi dòng được đánh dấu là thêm mới, chuyển lớp (mã đã có ở lớp khác), cập nhật (đã ở lớp này nhưng tên hoặc email khác), giữ nguyên, hoặc lỗi (thiếu thông tin, email sai, trùng mã trong tệp).
3. **Lưu** (`POST /api/students/import`): server kiểm tra lại các dòng rồi lưu trong một transaction và cập nhật sĩ số các lớp liên quan. Dòng lỗi bị bỏ qua. Nhập lại cùng một tệp không tạo bản trùng.

Tùy chọn **Tạo tài khoản đăng nhập** (bật sẵn): mỗi học sinh chưa có tài khoản được tạo một tài khoản với tên đăng nhập là mã học sinh (không phân biệt hoa thường) và mật khẩu ban đầu là mã học sinh viết đúng như trong tệp. Nếu tên đăng nhập đã thuộc người khác, tài khoản đó không được tạo và bản xem trước ghi rõ.

## Khoá API AI

Màn **Khoá API AI** (`/admin/ai-keys`, chỉ quản trị viên) quản lý các khoá Gemini: thêm, sửa hoặc thay khoá, bật/tắt, đổi thứ tự ưu tiên, xoá, và **Kiểm tra** (gọi thử Gemini bằng khoá đó).

- Khoá lưu trong bảng `ai_api_keys`, được mã hoá AES-256-GCM bằng khoá suy ra từ `AI_KEYS_SECRET` (nếu không đặt thì dùng `AUTH_JWT_SECRET`). API chỉ trả 4 ký tự cuối. **Đổi secret này thì các khoá đã lưu không giải mã được nữa**, phải nhập lại.
- Khoá chỉ lưu trong database, không đặt trong `.env`. Database mới chưa có khoá thì quản trị viên thêm ở màn này; trong lúc chưa có khoá, đọc ảnh/PDF và các gợi ý AI không hoạt động (dán nội dung đề và tệp Word vẫn tách được bằng bộ đọc đơn giản).
- Mỗi yêu cầu AI (`backend/ai/ai.service.ts`) thử khoá theo thứ tự ưu tiên, mỗi khoá thử các model trong `GEMINI_MODEL`. Khoá báo hết hạn mức hoặc giới hạn tốc độ (429 / RESOURCE_EXHAUSTED) được cho nghỉ 15 phút và hệ thống chuyển sang khoá kế tiếp. Khoá sai hoặc bị thu hồi được bỏ qua 24 giờ, hoặc tới khi được sửa hay bật lại. Model quá tải hoặc quá thời gian chờ thì chuyển sang model kế tiếp với cùng khoá.

## Đổi mật khẩu

Cột `users.must_change_password` được bật cho tài khoản tạo khi nhập Excel và khi quản trị viên đặt lại mật khẩu. Khi cột này bật, API chỉ cho gọi `GET /api/auth/me` và `PATCH /api/auth/password`; mọi API khác trả `403 PASSWORD_CHANGE_REQUIRED`. Giao diện chỉ hiện màn đổi mật khẩu cho tới khi đổi xong. Mọi người cũng tự đổi mật khẩu được qua menu tài khoản → **Đổi mật khẩu**. Mật khẩu mới cần ít nhất 8 ký tự và phải khác mật khẩu cũ.

## Thông báo

Chuông trên header hiện thông báo của người đang đăng nhập (`GET /api/notifications`), tự cập nhật mỗi 30 giây và khi chuyển trang. Thông báo được tạo trong cùng transaction với thao tác gây ra nó:

| Sự kiện | Người nhận | Bấm vào sẽ mở |
| --- | --- | --- |
| Bài được giao (tạo ở trạng thái đang giao, hoặc chuyển từ nháp/đã đóng sang đang giao) | Tài khoản học sinh đang hoạt động của lớp đó | `/student` |
| Học sinh nộp bài (kể cả làm lại) | Mọi giáo viên và quản trị viên đang hoạt động, vì lớp chưa gán giáo viên phụ trách | `/grading?assessment=...` |
| Giáo viên chốt điểm | Học sinh có bài đó | `/student` |

## Cấu trúc frontend

| Thư mục | Vai trò |
| --- | --- |
| `src/pages/` | Một file cho mỗi route; chỉ đọc tham số URL và điều hướng, rồi gọi component tính năng. |
| `src/components/<vai trò>/` | Màn hình tính năng (`teacher`, `student`, `admin`). |
| `src/components/ui/` | Thành phần dùng chung: `PageHeader` và `StatCard` (đầu trang và hàng số liệu, mọi trang đều dùng), `Button`, `Tabs`, `Pagination` + `usePagination` (phân trang phía client cho mọi bảng/danh sách), `Modal` (hộp thoại có Escape và focus), `QuestionReview` (hiển thị câu đã làm, cả trắc nghiệm lẫn tự luận), `SelectField`, `StudentAvatar`. Hộp thoại mới phải dùng `Modal`. |
| `src/context/AppContext.tsx` | Dữ liệu và các thao tác ghi; sau mỗi thao tác sẽ tải lại `GET /api/bootstrap`. |
| `src/api/client.ts` | Lời gọi API duy nhất; dùng kiểu input trong `shared/types.ts`. |
| `src/layouts/` | Khung trang (`AppShell` có sidebar/header/footer; `FocusLayout` toàn màn hình cho lúc làm bài và xem trước) và CSS giao diện chung. `product-design.css` chỉ định dạng theo tên class (`.page-header`, `.panel`, `.data-table`, `.btn`, `.badge`...), không dựa vào thứ tự thẻ HTML. |

## Backend

Các module NestJS: `database` (PostgreSQL, migration, seed), `auth` (JWT), `users` (quản trị tài khoản), `classes`, `students`, `assessments`, `submissions`, `notifications`, `ai`, `bootstrap`. Mỗi module gồm `*.module.ts`, `*.controller.ts` (chỉ nhận request và kiểm tra quyền bằng `@Roles`), `*.service.ts` (logic) và `*.dto.ts` (schema zod cho dữ liệu vào). Tiền tố `/api`, giới hạn body và shutdown hook nằm trong `backend/app.setup.ts`, dùng chung cho server và test.

## Tạo bài tập Tiếng Anh

Trang **Tạo bài tập** (`/assessments/new`, mở từ nút "Tạo đề từ tài liệu" ở màn Đề thi & bài tập; code ở `src/components/teacher/AssessmentComposer.tsx`) có hai cách: tải đề để AI tách câu hỏi, hoặc **Soạn thủ công**. Câu hỏi có hai thuộc tính:

- `format` — dạng bài như trên đề giấy. 19 dạng THCS/THPT khai báo trong `shared/exercise-formats.ts`: phát âm, trọng âm, ngữ pháp – từ vựng, đồng nghĩa, trái nghĩa, tìm lỗi sai, giao tiếp, câu gần nghĩa, kết hợp câu, sắp xếp, điền từ vào đoạn văn, đọc hiểu trắc nghiệm, đọc hiểu Đúng/Sai, điền từ, dạng đúng của từ, chia động từ, viết lại câu, dựng câu, viết đoạn văn. Mỗi dạng có hướng dẫn tiếng Việt, câu mẫu và cách chấm.
- `type` — cách chấm: chữ cái A–D, `true_false` (T/F, nhận cả True/False, Đúng/Sai), điền từ/viết lại câu (so khớp văn bản, nhiều đáp án ngăn bằng `/` hoặc `;`), `essay` (giáo viên chấm; điểm tự động không tính phần này).

Phần gạch chân được lưu dạng `<u>...</u>`. Giáo viên không phải gõ thẻ: ô câu hỏi, phương án và đoạn văn (`src/components/ui/UnderlineInput.tsx`) hiển thị gạch chân trực tiếp, bôi đen chữ rồi bấm nút U hoặc Ctrl+U để gạch hoặc bỏ gạch; dán chữ vào chỉ giữ chữ thuần. Khi hiển thị cho học sinh, chỉ thẻ `<u>` được dựng lại (`src/components/ui/RichText.tsx`), không chèn HTML.

**Xem trước như học sinh:** `/assessments/:id/preview` hiển thị đúng màn làm bài của học sinh (`ExamTaker` với `preview`). Không có gì được gửi lên server; "Nộp bài" chấm ngay trên trình duyệt bằng `shared/grading.ts` và hiện điểm cùng đáp án từng câu. Trang này mở sau khi lưu bài (kèm `?created=1`), từ nút con mắt trong danh sách đề, và từ nút "Xem trước" của trang soạn đề (xem bản nháp chưa lưu).

**OCR:** ảnh và PDF (kể cả bản scan) gửi thẳng cho Gemini; Word `.docx` được đọc trên server bằng `mammoth` (giữ gạch chân) rồi gửi phần chữ; `.txt` gửi phần chữ. Gemini trả JSON theo schema cố định; `backend/ai/exam-parser.ts` chuẩn hóa lại. Nếu đề có đáp án, AI dùng đáp án đó; nếu không, AI tự giải và câu đó được đánh dấu để giáo viên kiểm tra. `GEMINI_MODEL` là danh sách model thử lần lượt (mặc định `gemini-3.5-flash,gemini-3-flash-preview`), mỗi model có giới hạn thời gian; không có key hoặc mọi model lỗi thì văn bản được tách bằng bộ đọc đơn giản.

`shared/` dùng cho cả hai phía: `types.ts` (kiểu dữ liệu và kiểu input của API) và `grading.ts` (chấm điểm). Câu trắc nghiệm lưu đáp án là chữ cái; câu điền khuyết và viết lại câu lưu đáp án đầy đủ, nhiều đáp án được chấp nhận thì ngăn cách bằng `/` hoặc `;`. Kết quả OCR được chuẩn hóa ở `backend/ai/exam-parser.ts` trước khi trả về. Đọc ảnh/PDF cần ít nhất một khoá ở màn **Khoá API AI**; model chọn bằng `GEMINI_MODEL`.

Để nhập dữ liệu từ `data/eduassess.sqlite`, chạy `npm run db:import-sqlite`. Lệnh nhập các bản ghi theo ID và giữ dữ liệu PostgreSQL khác. Tùy chọn `--replace` sẽ xóa bản ghi ứng dụng cũ trước khi nhập; khi có tài khoản học sinh trong `users`, cần xử lý liên kết học sinh trước khi dùng tùy chọn đó.

Kiểm tra mã bằng `npm run lint`, `npm run build` và `npm test`. Đặt `TEST_DATABASE_URL` để chạy kiểm thử HTTP trên schema PostgreSQL riêng, tự xóa sau khi hoàn tất.

## Ngôn ngữ (Tiếng Việt / English)

- Nút **VI / EN** ở thanh trên cùng và trang đăng nhập; lựa chọn lưu trong trình duyệt (`localStorage.eduassess_lang`).
- Câu tiếng Việt trong code chính là khoá dịch: `const { t } = useI18n(); t('Lưu')`, có biến: `t('{count} bài chờ duyệt', { count })`. Ngoài React dùng `translate()` / `currentLocale()`.
- Bản tiếng Anh nằm ở `src/i18n/en/*.ts`; thiếu bản dịch thì hiện câu gốc. Thông báo lỗi tiếng Anh từ API được dịch sang tiếng Việt qua `src/i18n/vi-server.ts`.
- Dữ liệu người dùng nhập (tên lớp, đề, thông báo đã lưu, nhận xét) không được dịch.

## Sidebar thu gọn

Trên màn hình ≥ 1024px, nút **Thu gọn** ở cuối sidebar chuyển sang dạng chỉ có biểu tượng (rê chuột để xem tên trang); trạng thái lưu ở `localStorage.eduassess_sidebar_collapsed`. Trên mobile/iPad sidebar vẫn là menu trượt.

## Phân quyền giáo viên, giao nhiều lớp và chia sẻ đề

- **Lớp có giáo viên phụ trách** (`teacherIds`). Giáo viên chỉ thấy lớp mình phụ trách cùng học sinh, bài nộp của các lớp đó, và các đề mình tạo hoặc đề giao cho lớp mình. Admin thấy tất cả và đổi giáo viên phụ trách trong trang chi tiết lớp. Giáo viên tự tạo lớp thì tự động phụ trách lớp đó.
- **Dữ liệu riêng của từng giáo viên:** giáo viên chỉ thấy đề do mình tạo cùng bài nộp, chấm bài, phân tích, thông báo nộp bài và gợi ý AI của các đề đó, kể cả khi cùng phụ trách một lớp với giáo viên khác (lớp và học sinh thì dùng chung). Admin thấy tất cả. Đề tạo trước khi có phân quyền (chưa có người tạo) vẫn hiện cho giáo viên phụ trách lớp. Quy tắc nằm ở `backend/assessments/visibility.ts`.
- **Một đề giao cho nhiều lớp** (`classIds`). Có thể thêm lớp bất cứ lúc nào; lớp đã có học sinh nộp bài thì không bỏ ra được. Bài nháp có thể chưa có lớp.
- **Chia sẻ đề** (nút chia sẻ trong danh sách đề): chia sẻ trực tiếp cho giáo viên (họ nhận thông báo, đề hiện ở tab "Được chia sẻ với tôi") hoặc tạo liên kết `/shared/<token>` (tắt được bất cứ lúc nào). Người nhận mở đề, xem trước như học sinh, rồi bấm "Giao cho lớp của tôi" để tạo **bản sao riêng**; bản gốc và bài làm của lớp người chia sẻ không bị ảnh hưởng.
- Migration 6 chuyển `assessments.class_id` sang `data.classIds`, thêm `owner_id`, `share_token`, bảng `assessment_shares`, và gán mọi lớp hiện có cho tất cả giáo viên hiện có (admin chỉnh lại sau).

## Phân trang ở server và phân tích

- Các bảng Chấm bài, Đề thi, Học sinh và Tài khoản lấy từng trang từ API (`GET /api/submissions/page`, `/assessments/page`, `/students/page`, `/admin/users/page` với `page`, `pageSize` 10/20/50/100, `q` và bộ lọc). Lọc, đếm theo tab và phân trang chạy bằng SQL; frontend dùng hook `useServerPage` và tự tải lại sau mỗi thao tác sửa dữ liệu.
- Phân tích: `GET /api/analytics/assessments/:id?classId=` (câu sai nhiều, chủ điểm yếu, so sánh giữa các lớp) và `GET /api/analytics/classes/:id?page=` (các đề của một lớp). Logic tính nằm ở `shared/analytics.ts`, dùng chung cho cả hai phía.
