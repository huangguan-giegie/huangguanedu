import asyncio
import re

shell = r"""set +e
echo "HOST=$(hostname)"
echo "PWD=$(pwd)"
echo "## TOP_LEVEL"
for d in /opt /srv /var/www /home /root; do
  if [ -d "$d" ]; then
    echo "-- $d"
    find "$d" -maxdepth 2 -mindepth 1 -type d -print 2>/dev/null | head -100
  fi
done
echo "## HUANGGUANEDU_DIRS"
find /opt /srv /var/www /home /root -maxdepth 4 -type d -name huangguanedu -print 2>/dev/null
echo "## MATCHING_GIT_REPOS"
find /opt /srv /var/www /home /root -maxdepth 5 -type d -name .git -print 2>/dev/null | while read g; do
  p="${g%/.git}"
  u=$(git -C "$p" remote get-url origin 2>/dev/null || true)
  case "$u" in
    *huangguan-giegie/huangguanedu*) echo "$p|GIT=yes|REMOTE=match" ;;
  esac
done
echo "## DOCKER"
docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>&1
"""
r = await call_cli(
    product="Ecs",
    action="RunCommand",
    version="2014-05-26",
    region="cn-shanghai",
    params={
        "RegionId": "cn-shanghai",
        "InstanceId": ["i-uf6hfvsgyejin8s40j55"],
        "Type": "RunShellScript",
        "CommandContent": shell,
        "ContentEncoding": "PlainText",
        "KeepCommand": False,
        "RepeatMode": "Once",
        "Timeout": 60,
    },
)
invoke_id = r.get("InvokeId")
last = None
for _ in range(20):
    q = await call_cli(
        product="Ecs",
        action="DescribeInvocationResults",
        version="2014-05-26",
        region="cn-shanghai",