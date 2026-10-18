import fs from 'fs';
let code = fs.readFileSync('src/components/AutoComment.tsx', 'utf8');

// Add fbGet, fbPut to imports
if (!code.includes('fbGet')) {
    code = code.replace(/import \{ useStore \} from '\.\.\/store';/, "import { useStore } from '../store';\nimport { fbGet, fbPut } from '../lib/core';");
}

const saveConfigTarget = `    const saveConfig = (newConfig: Partial<AutoCommentConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...newConfig };
            try {
                localStorage.setItem('slp_autocomment', JSON.stringify({
                    comments: next.comments,
                    minDelay: next.minDelay,
                    maxDelay: next.maxDelay
                }));
            } catch (e) {}
            return next;
        });
    };`;

const saveConfigReplacement = `    const saveConfig = (newConfig: Partial<AutoCommentConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...newConfig };
            try {
                localStorage.setItem('slp_autocomment', JSON.stringify({
                    comments: next.comments,
                    minDelay: next.minDelay,
                    maxDelay: next.maxDelay
                }));
                // sync to firebase
                if ('comments' in newConfig || 'minDelay' in newConfig || 'maxDelay' in newConfig) {
                    fbPut('settings/autocomment', {
                        comments: next.comments,
                        minDelay: next.minDelay,
                        maxDelay: next.maxDelay
                    }).catch(() => {});
                }
            } catch (e) {}
            return next;
        });
    };

    // Sync settings from Firebase
    useEffect(() => {
        let mounted = true;
        const fetchSettings = async () => {
            try {
                const data = await fbGet('settings/autocomment');
                if (data && mounted) {
                    setConfig(prev => {
                        const newComments = data.comments ?? prev.comments;
                        const newMinDelay = data.minDelay ?? prev.minDelay;
                        const newMaxDelay = data.maxDelay ?? prev.maxDelay;
                        if (prev.comments !== newComments || prev.minDelay !== newMinDelay || prev.maxDelay !== newMaxDelay) {
                            return { ...prev, comments: newComments, minDelay: newMinDelay, maxDelay: newMaxDelay };
                        }
                        return prev;
                    });
                }
            } catch (e) {}
        };
        fetchSettings();
        const interval = setInterval(fetchSettings, 3000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);`;

if (code.includes(saveConfigTarget)) {
    code = code.replace(saveConfigTarget, saveConfigReplacement);
    fs.writeFileSync('src/components/AutoComment.tsx', code);
    console.log("AutoComment.tsx updated successfully.");
} else {
    console.log("Could not find saveConfig target in AutoComment.tsx.");
}
