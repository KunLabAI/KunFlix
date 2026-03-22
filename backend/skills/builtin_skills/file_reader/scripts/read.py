import os

def read_file(file_path: str) -> str:
    """
    Read the contents of a file.
    
    Args:
        file_path: Absolute or relative path to the file to read.
        
    Returns:
        The content of the file or an error message.
    """
    try:
        if not os.path.exists(file_path):
            return f"Error: File '{file_path}' does not exist."
            
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"
