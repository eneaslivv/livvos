use tauri::Manager;

/// Copia texto al clipboard del sistema
#[tauri::command]
pub async fn copy_to_clipboard(text: String) -> Result<(), String> {
    use arboard::Clipboard;
    
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(&text).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Obtiene texto del clipboard
#[tauri::command]
pub async fn get_clipboard_text() -> Result<String, String> {
    use arboard::Clipboard;
    
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

/// Simula Ctrl+V (o Cmd+V en macOS) para pegar
#[tauri::command]
pub async fn simulate_paste() -> Result<(), String> {
    use enigo::{Enigo, Key, KeyboardControllable};
    
    let mut enigo = Enigo::new();
    
    // Pequeña pausa para asegurar que el clipboard esté listo
    std::thread::sleep(std::time::Duration::from_millis(50));
    
    #[cfg(target_os = "macos")]
    {
        enigo.key_down(Key::Meta);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Meta);
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        enigo.key_down(Key::Control);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Control);
    }
    
    Ok(())
}

/// Copia texto y lo pega automáticamente (todo en uno)
#[tauri::command]
pub async fn copy_and_paste(text: String) -> Result<(), String> {
    use arboard::Clipboard;
    use enigo::{Enigo, Key, KeyboardControllable};
    
    // 1. Copiar al clipboard
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(&text).map_err(|e| e.to_string())?;
    
    // 2. Pequeña pausa
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    // 3. Simular paste
    let mut enigo = Enigo::new();
    
    #[cfg(target_os = "macos")]
    {
        enigo.key_down(Key::Meta);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Meta);
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        enigo.key_down(Key::Control);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Control);
    }
    
    Ok(())
}

/// Escribe texto directamente (caracter por caracter) - alternativa a paste
#[tauri::command]
pub async fn type_text(text: String, delay_ms: Option<u64>) -> Result<(), String> {
    use enigo::{Enigo, KeyboardControllable};
    
    let mut enigo = Enigo::new();
    let delay = delay_ms.unwrap_or(10);
    
    for c in text.chars() {
        enigo.key_sequence(&c.to_string());
        if delay > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delay));
        }
    }
    
    Ok(())
}
