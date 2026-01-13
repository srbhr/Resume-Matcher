# Lambda Call
*Calling a lambda function*

when a new CV has been uploaded to the DB, a lambda function is triggered to process the CV through various stages including validation, parsing, ATS scoring, and result persistence.

to start the lambda function locally for testing or development purposes, navigate to the `src` directory and run the following command:

## Syntax
```sh
cd src
python -m <lambda_module>
```

if the call won't be in this syntax, you need to set the `PYTHONPATH` environment variable to the `src` folder.