from json import dumps, loads

from boto3 import Session
from botocore.exceptions import ClientError, NoCredentialsError
from config import settings
from structlog import get_logger
from structlog.stdlib import BoundLogger
from types_boto3_bedrock_runtime.client import BedrockRuntimeClient
from types_boto3_bedrock_runtime.type_defs import InvokeModelResponseTypeDef

logger: BoundLogger = get_logger()


def main() -> None:
    bedrock_client()


def bedrock_client(
    model: str = "us.anthropic.claude-3-haiku-20240307-v1:0", max_tokens: int = 50
) -> None:
    try:
        session = Session(
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.region_name,
        )

        bedrock_runtime: BedrockRuntimeClient = session.client("bedrock-runtime")

        response: InvokeModelResponseTypeDef = bedrock_runtime.invoke_model(
            modelId=model,
            body=dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "messages": [{"role": "user", "content": "Say hello"}],
                    "max_tokens": max_tokens,
                }
            ),
        )

        result = loads(response["body"].read())
        logger.info(result["content"][0]["text"])

    except NoCredentialsError as exception:
        logger.error(f"No credentials provided: {exception.args}")

    except ClientError as exception:
        logger.error(
            f"Client error: {exception.response['Error']['Code']}, {exception.response['Error']['Message']}"
        )
