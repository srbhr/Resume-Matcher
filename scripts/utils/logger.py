import logging


def init_logging_config():
    class CustomFormatter(logging.Formatter):
        def __init__(self, file=False):
            super().__init__()
            yellow = "\x1b[36;10m" if not file else ""
            blue = "\x1b[35;10m" if not file else ""
            green = "\x1b[32;10m" if not file else ""
            red = "\x1b[31;10m" if not file else ""
            bold_red = "\x1b[31;1m" if not file else ""
            reset = "\x1b[0m" if not file else ""
            log = "%(asctime)s (%(filename)s:%(lineno)d) - %(levelname)s: "
            msg = reset + "%(message)s"

            self.FORMATS = {
                logging.DEBUG: blue + log + msg,
                logging.INFO: green + log + msg,
                logging.WARNING: yellow + log + msg,
                logging.ERROR: red + log + msg,
                logging.CRITICAL: bold_red + log + msg,
            }

        def format(self, record):
            log_fmt = self.FORMATS.get(record.levelno)
            formatter = logging.Formatter(log_fmt)
            return formatter.format(record)

    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)

    stderr_handler = logging.StreamHandler()
    stderr_handler.setLevel(logging.DEBUG)
    stderr_handler.setFormatter(CustomFormatter())
    logger.addHandler(stderr_handler)

    file_handler = logging.FileHandler("app.log",  mode="w")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(CustomFormatter(True))
    logger.addHandler(file_handler)
