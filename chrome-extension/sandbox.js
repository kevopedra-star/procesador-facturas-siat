// Registrar el worker local
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.js';

window.addEventListener('message', async (event) => {
    const data = event.data;
    if (data && data.action === 'parsePdf') {
        const arrayBuffer = data.arrayBuffer;
        const fileName = data.fileName;
        const index = data.index;
        
        try {
            const textsAndLinks = await extractTextAndLinks(arrayBuffer);
            // Responder al popup.js con los resultados
            window.parent.postMessage({
                action: 'pdfParsed',
                result: textsAndLinks,
                fileName: fileName,
                index: index,
                success: true
            }, '*');
        } catch (error) {
            console.error("Error en sandbox parsing:", error);
            window.parent.postMessage({
                action: 'pdfParsed',
                error: error.message,
                fileName: fileName,
                index: index,
                success: false
            }, '*');
        }
    }
});

async function extractTextAndLinks(arrayBuffer) {
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let rawText = "";
    let orderedText = "";
    const documentsMap = new Map();
    const baseUrl = "https://suma.aduana.gob.bo/b-oce/rest/downloadFile/";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const annotations = await page.getAnnotations();
        
        rawText += textContent.items.map(item => item.str).join(' ') + "\n";
        
        let items = textContent.items.map(item => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5]
        })).filter(item => item.str.trim() !== '');

        items.sort((a, b) => {
            const yDiff = b.y - a.y;
            if (Math.abs(yDiff) < 5) return a.x - b.x;
            return yDiff;
        });

        let currentLine = "";
        let lastY = -1;

        items.forEach(item => {
            if (lastY === -1) lastY = item.y;
            if (Math.abs(lastY - item.y) > 5) {
                orderedText += currentLine.trim() + "\n";
                currentLine = "";
            }
            currentLine += item.str + " ";
            lastY = item.y;
        });
        orderedText += currentLine.trim() + "\n\n";

        const links = annotations.filter(ann => ann.url && ann.url.includes(baseUrl));
        if (links.length > 0) {
            links.sort((a, b) => b.rect[1] - a.rect[1]); 
            for (const link of links) {
                const y = link.rect[1];
                const lineItems = textContent.items
                    .filter(item => Math.abs(item.transform[5] - y) < 5)
                    .sort((a, b) => a.transform[4] - b.transform[4]); 

                if (lineItems.length === 0) continue;
                
                const lineText = lineItems.map(item => item.str).join('');
                const cleanRow = lineText.replace(/\s+/g, ' ').replace(/Ver$/, '').trim();
                
                const numMatch = cleanRow.match(/^(\d+)\s/);
                if (!numMatch) continue;

                const num = numMatch[1];
                let textAfterNum = cleanRow.substring(numMatch[0].length).trim();
                
                const emisorKeywords = ['SHANGHAI', 'XIZI', 'TRANSPORTE', 'SEGUROS', 'COMPAÑIA', 'EMPRESA', 'SANTANDER', 'ITI', 'WEIR', 'YELLOW', 'INDUSTRIAL', 'CPL', 'EDISON', 'HUMMINGBIRD', 'ALMACENERA', 'NEW YORK', 'DEZE'];
                const emisorRegex = new RegExp(`(${emisorKeywords.join('|')})`, 'i');
                const emisorMatch = textAfterNum.match(emisorRegex);
                
                let tipoAndNumero;
                if (emisorMatch) {
                    tipoAndNumero = textAfterNum.substring(0, emisorMatch.index).trim();
                } else {
                    const dateMatch = textAfterNum.match(/\s\d{2}\/\d{2}\/\d{4}/);
                    if (dateMatch) tipoAndNumero = textAfterNum.substring(0, dateMatch.index).trim();
                    else tipoAndNumero = textAfterNum;
                }

                const parts = tipoAndNumero.split(' ');
                const numeroDoc = parts.pop() || 'SN';
                const tipo = parts.join(' ').trim();
                const uuidMatch = link.url.match(/[a-f0-9-]{36}/i);

                if (tipo && uuidMatch) {
                    const url = baseUrl + uuidMatch[0];
                    if (!documentsMap.has(url)) {
                        documentsMap.set(url, { num, tipo, numeroDoc, url });
                    }
                }
            }
        }
    }
    
    const finalLinksArray = Array.from(documentsMap.values()).sort((a, b) => parseInt(a.num) - parseInt(b.num));
    return { rawText, orderedText, links: finalLinksArray };
}
