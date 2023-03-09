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
    identifier = os.environ["IDENTIFIER"]
    distdir = os.environ["DISTDIR"]
    print("\ndistdir: " + distdir)
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
            # These directives aren't all necessary for the latest Rapid; some are useful in older versions of the index.html.
            for s in input:
                s = (
                    s.replace("dist/iD.css", f"/rapid/{distdir}/iD.css")
                    .replace("'dist/iD.js'", f"'/rapid/{distdir}/iD.js'")
                    .replace("'iD.js'", f"'/rapid/{distdir}/iD.js'")
                    .replace("'dist/iD.legacy.js'", f"'/rapid/{distdir}/iD.legacy.js'")
                    .replace(
                        "var id = iD.coreContext();",
                        f"var id = iD.coreContext().assetPath('/rapid/{distdir}/');",
                    )
                    .replace(".assetPath('')", f".assetPath('/rapid/{distdir}/')")
                    .replace("href='iD.css'", f"href='/rapid/{distdir}/iD.css'")
                    .replace("'iD.min.js'", f"'/rapid/{distdir}/iD.min.js'")
                    .replace("'iD.legacy.js'", f"'/rapid/{distdir}/iD.legacy.js'")
                )
                output.write(s)

if __name__ == "__main__":
    deploy()