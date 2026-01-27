import toast from 'react-hot-toast';

/**
 * Copies text to clipboard with fallback for older browsers/non-secure contexts
 */
export const copyToClipboard = async (text: string, label: string = 'Texte') => {
    if (!text) return;

    try {
        // Try modern API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copié !`);
            return;
        }
        throw new Error('Clipboard API unavailable');
    } catch (err) {
        // Fallback to legacy execCommand
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // Ensure it's not visible but part of the DOM
            // Fixed position off-screen can sometimes cause issues on mobile
            // Using absolute with opacity 0 is safer
            textArea.style.position = "absolute";
            textArea.style.left = "0";
            textArea.style.top = "0";
            textArea.style.opacity = "0";
            textArea.style.pointerEvents = "none";
            textArea.contentEditable = "true"; // Required for iOS
            textArea.readOnly = false; // Required for iOS

            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            // For iOS
            textArea.setSelectionRange(0, 999999);

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) {
                toast.success(`${label} copié !`);
            } else {
                // Last resort: prompt user
                window.prompt("Copier le texte :", text);
            }
        } catch (fallbackErr) {
            console.error('Copy failed', fallbackErr);
            // Last resort: prompt user
            window.prompt("Copier le texte :", text);
        }
    }
};
