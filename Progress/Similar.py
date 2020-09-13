import textdistance as td
import Cleaner

def match(resume, job_des):
    j = td.jaccard.similarity(resume, job_des)*100
    s = td.sorensen_dice.similarity(resume, job_des)*100
    c = td.cosine.similarity(resume, job_des)*100
    o = td.overlap.normalized_similarity(resume, job_des)*100
    total = (j+s+c+o)/4
    return total

# https://realpython.com/working-with-files-in-python/

# https://support.dlink.ca/emulators/wbr2310/index.htm
