#!/usr/bin/env python3

import os
import platform
import re
import subprocess

"""Script to build & upload RapiD to mapwith.ai's S3 bucket
Usage: python3 aws_deploy.py

Assumptions: 
1) You have the aws cli installed, and have run 'AWS configure' to set up your secret ID / key pair to stay authenticated. 

2) You have installed python 3. 

3) You are running from within the iD directory. 
"""

def preflight_build(): 
    print("Calculating build hash and distdir...")
    output = subprocess.run(["git",  "rev-parse",  "--short",  "HEAD"], capture_output=True)

    hash = output.stdout.decode("utf-8").strip()
    print("\ngithash: " + hash)

    distdir = hash + "-dist"
    print("\ndistdir: " + distdir)

    print("\nRunning npm install")
    subprocess.check_call(["npm", "install"])

    print("\nRunning npm run all")
    subprocess.check_call(["npm", "run", "all"])
    
    print("\nCopying dist folder")
    subprocess.check_call(["cp", "-a", "dist", distdir])

    print("\nPrepping rapid.html with correct asset, css, and javascript paths")

    index = "dist/index.html"
    newindex = os.path.join(distdir, "index.html")

    with open(index, 'r') as input:
        with open(newindex, 'w+') as output:

            for s in input:
                s = s.replace("iD.css", f"/rapid/{distdir}/iD.css") \
                .replace("iD.js", f"/rapid/{distdir}/iD.js") \
                .replace(
                    "var id = iD.Context();", 
                    f"var id = iD.Context().assetPath('/rapid/{distdir}/');"
                )
                output.write(s);

    print("\nCopying new " + distdir + "folder and index file to s3.")
    subprocess.check_call(("aws s3 cp " + distdir + " s3://world.ai.rapid/rapid/" + distdir + " --recursive").split())
    subprocess.check_call(("aws s3 cp " + newindex + " s3://world.ai.rapid/rapid/" + hash + "-rapid.html").split())

if __name__ == "__main__":
    preflight_build()
