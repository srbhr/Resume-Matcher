import logging


def get_handlers(
    filename="app.log", mode="w", file_level=logging.DEBUG, stderr_level=logging.DEBUG
):
    """
    The function `get_handlers` returns a stream handler and a file handler with specified logging
    levels and formatters.

    Args:
      filename: The `filename` parameter is the name of the log file where the log messages will be
    written. In this case, the default filename is "app.log". Defaults to app.log
      mode: The `mode` parameter in the `get_handlers` function specifies the mode in which the file
    should be opened. In this case, the default mode is set to "w", which stands for write mode. This
    means that if the file already exists, it will be truncated (i.e., its. Defaults to w
      file_level: The `file_level` parameter in the `get_handlers` function is used to specify the
    logging level for the file handler. In this case, it is set to `logging.DEBUG`, which means that the
    file handler will log all messages at the DEBUG level and above.
      stderr_level: The `stderr_level` parameter in the `get_handlers` function is used to specify the
    logging level for the StreamHandler that outputs log messages to the standard error stream (stderr).
    This level determines which log messages will be processed and output by the StreamHandler.

    Returns:
      The `get_handlers` function returns two logging handlers: `stderr_handler` which is a
    StreamHandler for logging to stderr, and `file_handler` which is a FileHandler for logging to a file
    specified by the `filename` parameter.
    """
    # Stream handler
    stderr_handler = logging.StreamHandler()
    stderr_handler.setLevel(stderr_level)
    stderr_handler.setFormatter(CustomFormatter())

    # File handler
    file_handler = logging.FileHandler(filename, mode=mode)
    file_handler.setLevel(file_level)
    file_handler.setFormatter(CustomFormatter(True))

    # TODO: Add RotatingFileHandler

    return stderr_handler, file_handler


class CustomFormatter(logging.Formatter):
    """
    A custom log formatter that adds color to log messages based on the log level.

    Args:
        file (bool): Indicates whether the log is being written to a file. Default is False.

    Attributes:
        FORMATS (dict): A dictionary mapping log levels to colorized log message formats.

    Methods:
        format(record): Formats the log record with the appropriate colorized log message format.

    """

    def __init__(self, file=False):
        """
        This function initializes logging formats with different colors and styles based on the log
        level.

        Args:
          file: The `file` parameter in the `__init__` method is a boolean flag that determines whether
        the logging output should be colored or not. If `file` is `True`, the colors will not be applied
        to the log messages. Defaults to False
        """
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
        """
        Formats the log record with the appropriate colorized log message format.

        Args:
            record (LogRecord): The log record to be formatted.

        Returns:
            str: The formatted log message.

        """
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


def init_logging_config(
    basic_log_level=logging.INFO,
    filename="app.log",
    mode="w",
    file_level=logging.DEBUG,
    stderr_level=logging.DEBUG,
):
    """
    The function `init_logging_config` initializes logging configuration in Python by setting basic log
    level, configuring handlers, and adding them to the logger.

    Args:
      basic_log_level: The `basic_log_level` parameter is used to set the logging level for the root
    logger. In this function, it is set to `logging.INFO` by default, which means that log messages with
    severity level INFO or higher will be processed.
      filename: The `filename` parameter is a string that specifies the name of the log file where the
    logs will be written. In the `init_logging_config` function you provided, the default value for
    `filename` is "app.log". This means that if no filename is provided when calling the function, logs.
    Defaults to app.log
      mode: The `mode` parameter in the `init_logging_config` function specifies the mode in which the
    log file will be opened. In this case, the default value is "w" which stands for write mode. This
    means that the log file will be opened for writing, and if the file already exists. Defaults to w
      file_level: The `file_level` parameter in the `init_logging_config` function is used to specify
    the logging level for the file handler. This determines the severity level of log messages that will
    be written to the log file specified by the `filename` parameter. In this case, the default value
    for `file
      stderr_level: The `stderr_level` parameter in the `init_logging_config` function is used to
    specify the logging level for the stderr (standard error) handler. This handler is responsible for
    directing log messages to the standard error stream. The logging level determines which severity of
    log messages will be output to the stderr.
    """

    logger = logging.getLogger()
    logger.setLevel(basic_log_level)

    # Get the handlers
    stderr_handler, file_handler = get_handlers(
        file_level=file_level, stderr_level=stderr_level, filename=filename, mode=mode
    )

    # Add the handlers
    logger.addHandler(stderr_handler)
    logger.addHandler(file_handler)
