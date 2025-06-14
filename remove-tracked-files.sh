# Remove content-edit.meta.json files from Git tracking
git rm --cached -r . -f --ignore-unmatch
git add .
git commit -m "Remove content-edit.meta.json files from tracking"

# Alternative if you want to be more specific:
# find . -name "content-edit.meta.json" -exec git rm --cached {} \;
