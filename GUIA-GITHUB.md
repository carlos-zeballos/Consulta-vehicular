# 🚀 GUÍA: Subir Proyecto a GitHub

## 📋 PASO A PASO

### 1. Verificar que el proyecto esté listo

```bash
# Verificar que no hay archivos sensibles
git status
```

### 2. Agregar archivos al staging

```bash
# Agregar todos los archivos (excepto los del .gitignore)
git add .
```

### 3. Hacer commit inicial

```bash
git commit -m "Initial commit: Consulta Vehicular - Sistema completo"
```

### 4. Crear repositorio en GitHub

1. Ve a https://github.com
2. Clic en "New repository" (botón verde)
3. Nombre: `consulta-vehicular` (o el que prefieras)
4. Descripción: "Sistema de consulta vehicular completo"
5. Público o Privado (tu elección)
6. **NO marques** "Initialize with README" (ya tenemos uno)
7. Clic en "Create repository"

### 5. Conectar repositorio local con GitHub

```bash
# Conectar con tu repositorio
git remote add origin https://github.com/carlos-zeballos/Consulta-vehicular.git
```

### 6. Subir código a GitHub

```bash
# Subir a la rama main
git branch -M main
git push -u origin main
```

### 7. Verificar en GitHub

Ve a tu repositorio en GitHub y verifica que todos los archivos estén presentes.

## ✅ CHECKLIST ANTES DE SUBIR

- [ ] `.env` NO está en el repositorio (está en .gitignore)
- [ ] `node_modules/` NO está en el repositorio
- [ ] Archivos de test eliminados
- [ ] Archivos .md de documentación eliminados (excepto README.md)
- [ ] README.md actualizado
- [ ] `.gitignore` configurado correctamente

## 🔐 IMPORTANTE

**NUNCA subas el archivo `.env` a GitHub** - Contiene credenciales sensibles.

El `.gitignore` ya está configurado para excluirlo automáticamente.

## 🆘 SOLUCIÓN DE PROBLEMAS

### Error: "remote origin already exists"

```bash
git remote remove origin
git remote add origin https://github.com/carlos-zeballos/Consulta-vehicular.git
```

### Error: "failed to push some refs"

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### Verificar que .env no se suba

```bash
git status
# Si aparece .env en los archivos a subir:
git rm --cached .env
git commit -m "Remove .env from tracking"
```
