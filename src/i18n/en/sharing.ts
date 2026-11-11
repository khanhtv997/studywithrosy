/** English for multi-class assignment, class teachers and sharing between teachers. */
const en: Record<string, string> = {
  // Composer
  'Hãy chọn ít nhất một lớp được giao bài.': 'Choose at least one class to assign it to.',
  'Giao bài': 'Assign',
  'Giao cho {count} lớp': 'Assign to {count} classes',
  '{count} lớp: {names}': '{count} classes: {names}',
  'Bạn chưa phụ trách lớp nào.': 'You are not in charge of any class yet.',
  'Bỏ chọn tất cả': 'Clear all',
  'Chọn tất cả': 'Select all',

  // Assessment list
  'Nguồn đề': 'Source',
  'Đề của tôi': 'My tests',
  'Được chia sẻ với tôi': 'Shared with me',
  'Bản sao từ đề của {name}': 'Copied from {name}',
  'giáo viên khác': 'another teacher',
  'Người tạo: {name}': 'Created by {name}',
  'Người tạo': 'Created by',
  'Lớp khác': 'Other class',
  'Chia sẻ: {title}': 'Share: {title}',
  'Chia sẻ cho giáo viên khác': 'Share with other teachers',
  'Lớp được giao: {names}. Bấm để đổi.': 'Assigned to: {names}. Click to change.',
  'Chưa giao lớp nào. Bấm để chọn lớp.': 'Not assigned to any class. Click to choose.',
  'Chưa giao lớp': 'No class yet',
  'Chia sẻ bởi': 'Shared by',
  'Ngày chia sẻ': 'Shared on',
  'Xem & giao': 'View & assign',
  'Chưa có ai chia sẻ đề với bạn. Khi giáo viên khác chia sẻ, đề sẽ hiện ở đây.': 'Nobody has shared a test with you yet. Tests other teachers share will appear here.',

  // Assign classes dialog
  '{count} bài đã nộp': '{count} submitted',
  'Bài đang giao phải có ít nhất một lớp.': 'An assigned test needs at least one class.',
  'Chọn một hoặc nhiều lớp. Mỗi lớp làm cùng một đề và cùng hạn nộp.': 'Choose one or more classes. Every class gets the same test and due date.',
  'Bài còn được giao cho {count} lớp của giáo viên khác; các lớp đó giữ nguyên.': "It is also assigned to {count} of other teachers' classes; those stay as they are.",
  'Lớp đã có bài nộp không bỏ ra được.': 'Classes with submissions cannot be removed.',
  'Bài đang được giao: học sinh của {count} lớp mới sẽ nhận thông báo và thấy bài ngay.': 'This test is live: students in the {count} new classes will be notified and see it right away.',

  // Class teachers
  'Giáo viên phụ trách': 'Teachers in charge',
  'Đổi giáo viên phụ trách': 'Change teachers in charge',
  'Chưa có giáo viên phụ trách': 'No teacher assigned',
  'Chưa có tài khoản giáo viên nào. Tạo ở màn Tài khoản.': 'There are no teacher accounts yet. Create them under Accounts.',
  'Giáo viên được chọn sẽ thấy lớp này, học sinh, bài giao và bài nộp của lớp.': "The selected teachers will see this class, its students, assignments and submissions.",
  'Bạn sẽ là giáo viên phụ trách lớp này.': 'You will be the teacher in charge of this class.',

  // Share dialog
  'Chia sẻ đề': 'Share test',
  'Giáo viên được chia sẻ sẽ xem được đề và đáp án, rồi tạo bản sao của riêng họ để giao cho lớp mình. Bản gốc và bài làm của học sinh lớp bạn không bị ảnh hưởng.':
    "Teachers you share with can see the questions and answers, then make their own copy to assign to their classes. Your original and your students' work are not affected.",
  'Chia sẻ với giáo viên': 'Share with teachers',
  'đã chia sẻ {date}': 'shared {date}',
  'Bỏ chia sẻ với {name}': 'Stop sharing with {name}',
  'Bỏ chia sẻ': 'Stop sharing',
  'Tìm giáo viên': 'Find a teacher',
  'Tìm giáo viên theo tên hoặc email...': 'Search teachers by name or email...',
  'Chưa có giáo viên nào khác trên hệ thống.': 'There are no other teachers on the system yet.',
  'Không có giáo viên nào khớp.': 'No matching teachers.',
  'Đang chia sẻ...': 'Sharing...',
  'Chia sẻ': 'Share',
  'Chia sẻ qua liên kết': 'Share by link',
  'Liên kết chia sẻ': 'Share link',
  'Đã sao chép': 'Copied',
  'Sao chép': 'Copy',
  'Tắt liên kết': 'Turn off link',
  'Ai có liên kết và có tài khoản giáo viên trên hệ thống đều mở được. Tắt liên kết thì liên kết cũ hết hiệu lực.': 'Anyone with the link and a teacher account on the system can open it. Turning the link off makes the old link stop working.',
  'Tạo liên kết chia sẻ': 'Create share link',
  'Đang tạo...': 'Creating...',
  'Xong': 'Done',
  'Không sao chép được. Hãy chọn liên kết và sao chép thủ công.': 'Could not copy. Select the link and copy it yourself.',

  // Shared test page
  'Không mở được đề được chia sẻ': 'Could not open the shared test',
  'Đang tải đề...': 'Loading test...',
  'Đang xem trước như học sinh. Bài làm thử không được lưu.': 'Previewing as a student. Practice answers are not saved.',
  'Hãy chọn ít nhất một lớp để giao bài.': 'Choose at least one class to assign it to.',
  '{count} câu · {points} điểm': '{count} questions · {points} points',
  'Không giới hạn thời gian': 'No time limit',
  'Đề được chia sẻ': 'Shared test',
  'Xem lại đề, rồi tạo bản sao của bạn để giao cho lớp mình. Bản gốc không bị thay đổi.': 'Look over the test, then make your own copy to assign to your classes. The original is not changed.',
  'Thông tin đề': 'About this test',
  'Dạng bài': 'Exercise types',
  '… và {count} câu nữa.': '… and {count} more questions.',
  'Xem toàn bộ': 'See all',
  'Giao cho lớp của tôi': 'Assign to my classes',
  'Bạn sẽ có bản sao riêng: sửa, giao và chấm độc lập với người chia sẻ.': 'You get your own copy: edit, assign and grade it independently of the sharer.',
  'Đây là đề của chính bạn. Tạo bản sao chỉ khi bạn muốn một phiên bản riêng.': 'This is your own test. Make a copy only if you want a separate version.',
  'Bạn đã tạo {count} bản sao từ đề này': 'You have made {count} copies of this test',
  'Chọn lớp để giao': 'Classes to assign to',
  'Đang giao...': 'Assigning...',
  'Lưu vào đề của tôi (nháp)': 'Save to my tests (draft)',

  // Server messages in Vietnamese
  'Hãy chọn ít nhất một lớp trước khi giao bài.': 'Choose at least one class before assigning.',
  'Liên kết chia sẻ không còn hiệu lực hoặc bạn không được chia sẻ đề này.': 'The share link no longer works, or this test was not shared with you.',
};

export default en;
