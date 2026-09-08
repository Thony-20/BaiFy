const XLSX = require('./frontend/node_modules/xlsx');
const path = require('path');

const filePath = 'c:\\Users\\rosas\\OneDrive\\Desktop\\Gestión de Stocks\\frontend\\inventario_301_unicos.xlsx';

try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const target = rawJson.find(p => p.nombre && p.nombre.includes("Crema Dental Blanqueadora 75ml"));

    if (target) {
        console.log("--- PRODUCTO ENCONTRADO EN EXCEL ---");
        console.log(JSON.stringify(target, null, 2));
    } else {
        console.log("No se encontró el producto en el Excel.");
        // Mostrar los primeros nombres para ver si hay variaciones
        console.log("Muestra de nombres:");
        console.log(rawJson.slice(0, 10).map(p => p.nombre));
    }
} catch (error) {
    console.error("Error:", error.message);
}
