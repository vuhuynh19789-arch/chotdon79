import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const searchModal = `{activeModal === 'minigame' && (
            <MinigameModal 
                onClose={() => setActiveModal(null)} 
                onOpenProfile={(u, p) => { setProfileUser({user: u, platform: p}); setActiveModal('profile'); }}
                onOpenPrice={(id, u, p) => { setPendingPrint({id, user: u, platform: p}); setActiveModal('price'); }}
            />
        )}`;
        
const replaceModal = `{activeModal === 'minigame' && (
            <MinigameModal 
                onClose={() => setActiveModal(null)} 
                onOpenProfile={(u, p) => { setProfileUser({user: u, platform: p}); setActiveModal('profile'); }}
                onOpenPrice={(id, u, p) => { setPendingPrint({id, user: u, platform: p}); setActiveModal('price'); }}
            />
        )}
        {activeModal === 'autocomment' && (
            <AutoCommentModal 
                config={autoComment.config} 
                saveConfig={autoComment.saveConfig} 
                onClose={() => setActiveModal(null)} 
            />
        )}`;

code = code.replace(searchModal, replaceModal);
fs.writeFileSync('src/App.tsx', code);
