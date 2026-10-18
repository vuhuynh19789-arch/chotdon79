import fs from 'fs';
let code = fs.readFileSync('src/components/Feed.tsx', 'utf8');

const target2 = `    const handlePrint = (c: CommentData) => {`;
const replacement2 = `    const handleRepost = async (c: CommentData) => {
        if (reposting[c.id]) return;
        setReposting(prev => ({ ...prev, [c.id]: true }));
        const success = await store.repostComment(c.platform, c.content);
        if (!success) {
            alert("Gửi lệnh đăng lại thất bại, kiểm tra kết nối mạng.");
        }
        setTimeout(() => {
            setReposting(prev => ({ ...prev, [c.id]: false }));
        }, 1500);
    };

    const handlePrint = (c: CommentData) => {`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/Feed.tsx', code);
