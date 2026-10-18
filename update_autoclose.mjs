import fs from 'fs';
let code = fs.readFileSync('src/components/AutoClose.tsx', 'utf8');

// Add fbGet, fbPut to imports
code = code.replace(/import \{ extractPriceFromContent \} from '\.\.\/lib\/core';/, "import { extractPriceFromContent, fbGet, fbPut } from '../lib/core';");

// Insert sync effect and update saveConfig
const saveConfigTarget = `    const saveConfig = (newConfig: Partial<AutoCloseConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...newConfig };
            try {
                localStorage.setItem('slp_autoclose', JSON.stringify({
                    excludeKeywords: next.excludeKeywords,
                    excludeTags: next.excludeTags,
                    isRunning: next.isRunning
                }));
            } catch (e) {}
            return next;
        });
    };`;

const saveConfigReplacement = `    const saveConfig = (newConfig: Partial<AutoCloseConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...newConfig };
            try {
                localStorage.setItem('slp_autoclose', JSON.stringify({
                    excludeKeywords: next.excludeKeywords,
                    excludeTags: next.excludeTags,
                    isRunning: next.isRunning
                }));
                // sync to firebase
                if ('excludeKeywords' in newConfig || 'excludeTags' in newConfig) {
                    fbPut('settings/autoclose', {
                        excludeKeywords: next.excludeKeywords,
                        excludeTags: next.excludeTags
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
                const data = await fbGet('settings/autoclose');
                if (data && mounted) {
                    setConfig(prev => {
                        const newKeywords = data.excludeKeywords ?? prev.excludeKeywords;
                        const newTags = data.excludeTags ?? prev.excludeTags;
                        if (prev.excludeKeywords !== newKeywords || JSON.stringify(prev.excludeTags) !== JSON.stringify(newTags)) {
                            return { ...prev, excludeKeywords: newKeywords, excludeTags: newTags };
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
    fs.writeFileSync('src/components/AutoClose.tsx', code);
    console.log("AutoClose.tsx updated successfully.");
} else {
    console.log("Could not find saveConfig target in AutoClose.tsx.");
}
