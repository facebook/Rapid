import errno
import os
import shutil
import subprocess
import sys

"""Script to upload Rapid to S3 bucket
Usage: python3 aws_deploy.py

Assumptions:
1) You have the aws cli installed, and it can get access to credentials
1a) This can be anything specified here: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html
1b) For github actions, you should have AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY set as secrets, with AWS_DEFAULT_REGION in the environment
2) You have installed python 3.
3) You are running from within the Rapid project directory.
4) Environment variable RAPID_S3_BUCKET_NAME is defined (default: world.ai.rapid)
5) Environment variable RAPID_WEB_ROOT is defined (default: https://mapwith.ai/)
6) Environment variable NODE_VERSION is defined
See .github/workflows/build.yml for usage there
"""

def deploy():
    print("Calculating build hash and distdir...")
    output = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True
    )
    hash = output.stdout.decode("utf-8").strip()
    print("\ngithash: " + hash)

    #print all env vars
    #print( '\n'.join([f'{k}: {v}' for k, v in sorted(os.environ.items())]) )

    identifier = os.environ["IDENTIFIER"]
    distdir = os.environ["DISTDIR"]
    #print("\nIDENTIFIER: " + identifier)
    #print("\nDISTDIR: " + distdir)

    # Blow away the previous dir, if any.
    if os.path.exists(distdir):
        print(f"Previous distribution dir {distdir} found, removing.")
        shutil.rmtree(distdir)
    print(f"\nCreating dist folder {distdir}")
    try:
        os.mkdir(distdir)
    except OSError as err:
        if err.errno == errno.EEXIST:
            print(f"{distdir} already exists")
        elif err.errno == errno.EACCES:
            print(f"{distdir} permission denied")
        raise
    print("\nCopying dist folder")
    subprocess.check_call(args=f"cp -a ./dist/* {distdir}", shell=True)
    print("\nPrepping rapid.html with correct asset, css, and javascript paths")
    index = "dist/index.html"
    newindex = os.path.join(distdir, "index.html")
    with open(index, "r") as input:
        with open(newindex, "w+") as output:
            # Point assets at the unique dir we created for this build
            for s in input:
                s = (
                    s.replace("dist/rapid.css", f"/rapid/{distdir}/rapid.css")
                    .replace("'dist/rapid.js'", f"'/rapid/{distdir}/rapid.js'")
                    .replace("'rapid.js'", f"'/rapid/{distdir}/rapid.js'")
                    .replace(".assetPath = ''", f".assetPath = '/rapid/{distdir}/'")
                    .replace("href='rapid.css'", f"href='/rapid/{distdir}/rapid.css'")
                    .replace("'rapid.min.js'", f"'/rapid/{distdir}/rapid.min.js'")
                )
                output.write(s)

if __name__ == "__main__":
    deploy()