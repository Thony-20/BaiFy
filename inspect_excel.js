const XLSX = require('./frontend/node_modules/xlsx');
const path = require('path');

const filePath = 'c:\\Users\\rosas\\OneDrive\\Desktop\\Gestión de Stocks\\frontend\\inventario_301_unicos.xlsx';

try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    console.log("--- INFORMACIÓN DEL EXCEL ---");
    console.log("Hojas encontradas:", workbook.SheetNames);
    console.log("Hoja procesada:", firstSheetName);
    
    if (rawJson.length > 0) {
        console.log("\nColumnas detectadas (Raw):");
        console.log(Object.keys(rawJson[0]));
        
        console.log("\nEjemplo de los primeros 3 productos:");
        console.log(JSON.stringify(rawJson.slice(0, 3), null, 2));
    } else {
        console.log("El archivo está vacío.");
    }
} catch (error) {
    console.error("Error al leer el archivo:", error.message);
}
