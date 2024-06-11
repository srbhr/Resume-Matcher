import os


def get_filenames_from_dir(directory_path: str) -> list:
    filenames = [
        f
        for f in os.listdir(directory_path)
        if os.path.isfile(os.path.join(directory_path, f)) and f != ".DS_Store"
    ]
    return filenames


def make_sure_path_exists(directory_path: str):
    os.makedirs(directory_path, exist_ok=True)
