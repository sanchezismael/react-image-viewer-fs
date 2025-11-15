# Configuración del Entorno de Desarrollo

Esta guía explica cómo configurar Node.js y npm **permanentemente** para que funcionen en cualquier terminal nueva sin configuración manual.

## Problema Común

Si al abrir una nueva terminal PowerShell o CMD ejecutas `npm` o `node` y obtienes errores como:
- `npm : El término 'npm' no se reconoce...`
- `node : No se puede ejecutar...`

Es porque **Node.js no está en el PATH del sistema**.

---

## Solución Definitiva (Una sola vez)

### Opción A: Script Automático (Recomendado)

1. **Ejecuta PowerShell como ADMINISTRADOR**:
   - Click derecho en el icono de PowerShell
   - Selecciona "Ejecutar como administrador"

2. **Navega a la carpeta del proyecto**:
   ```powershell
   cd C:\Users\ISAG\Documents\CellsIA\react-image-viewer
   ```

3. **Ejecuta el script de configuración**:
   ```powershell
   .\setup-node-path.ps1
   ```

4. **Cierra TODAS las ventanas de PowerShell/CMD abiertas**

5. **Abre una nueva terminal** y verifica:
   ```powershell
   node --version
   npm --version
   ```

✅ **Listo**: Ahora `node` y `npm` funcionarán en **cualquier** nueva terminal automáticamente.

---

### Opción B: Manual (Si no tienes permisos de administrador)

1. **Busca la carpeta de Node.js** (normalmente `C:\Program Files\nodejs`)

2. **Agrega Node.js al PATH del usuario**:
   - Presiona `Win + R`, escribe `sysdm.cpl` y pulsa Enter
   - Ve a la pestaña "Opciones avanzadas"
   - Click en "Variables de entorno"
   - En "Variables de usuario", busca `Path` y haz doble click
   - Click en "Nuevo" y agrega: `C:\Program Files\nodejs`
   - Click OK en todas las ventanas

3. **Cierra TODAS las terminales** y abre una nueva

4. **Verifica**:
   ```powershell
   node --version
   npm --version
   ```

---

## ¿Y si no tengo Node.js instalado?

### Instalar Node.js con Winget (Recomendado)

```powershell
winget install OpenJS.NodeJS.LTS
```

Luego cierra y vuelve a abrir la terminal, o sigue los pasos de "Opción A" arriba.

### Instalador Manual

1. Descarga Node.js LTS desde: https://nodejs.org/
2. Ejecuta el instalador (marca la opción "Add to PATH" durante la instalación)
3. Reinicia la terminal

---

## Scripts de Inicio Rápido

Una vez Node.js esté configurado correctamente, usa cualquiera de estos métodos para lanzar la app:

### PowerShell
```powershell
.\start-app.ps1
```

### Batch (CMD)
```cmd
start-app.bat
```

### NPM directo
```powershell
npm install        # Solo la primera vez
npm run dev        # Lanza backend + frontend
```

---

## Verificar que Todo Funciona

Abre una **nueva** terminal PowerShell (no la misma donde ejecutaste el script) y prueba:

```powershell
# Verificar Node.js y npm
node --version     # Debe mostrar v18.x o v20.x
npm --version      # Debe mostrar 9.x o 10.x

# Navegar al proyecto
cd C:\Users\ISAG\Documents\CellsIA\react-image-viewer

# Instalar dependencias (si no lo has hecho)
npm install

# Lanzar la aplicación
npm run dev
```

Si todos los comandos funcionan sin errores, ¡la configuración está lista! 🎉

---

## Comandos de Desarrollo Útiles

```powershell
# Instalar/actualizar dependencias
npm install

# Lanzar app en modo desarrollo (backend + frontend)
npm run dev

# Construir para producción
npm run build

# Verificar errores de TypeScript
npm run typecheck    # (una vez configurado)

# Ejecutar linter
npm run lint         # (una vez configurado)
```

---

## Solución de Problemas

### "npm install" falla con errores de red
```powershell
npm config set registry https://registry.npmjs.org/
npm cache clean --force
npm install
```

### "Access is denied" al instalar paquetes globales
Ejecuta PowerShell como administrador o usa:
```powershell
npm config set prefix "$env:LOCALAPPDATA\npm"
```

### Los cambios en PATH no se aplican
1. Verifica que cerraste **TODAS** las ventanas de terminal (incluyendo VS Code)
2. Abre una terminal completamente nueva
3. Si aún no funciona, reinicia el PC

---

## Próximos Pasos

Una vez Node.js funcione correctamente:
1. Ejecuta `npm install` en la carpeta del proyecto
2. Lanza `npm run dev` o usa los scripts `.ps1` / `.bat`
3. Abre http://localhost:3000 para el frontend
4. El backend estará en http://localhost:3001

¡Listo para desarrollar! 🚀
