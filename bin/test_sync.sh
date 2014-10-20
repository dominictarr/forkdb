#!/bin/bash

rm -rf /tmp/{a,b}
echo hey yo | forkdb -d /tmp/a create yo
echo ZING | forkdb -d /tmp/a create yo --prev=55a0f917f274311f54874dc7af9682e7b625846286ecce4056ab1a2d88489df7
echo WOOOOOOO | forkdb -d /tmp/b create yo --prev=55a0f917f274311f54874dc7af9682e7b625846286ecce4056ab1a2d88489df7
dupsh 'forkdb -d /tmp/a sync' 'forkdb -d /tmp/b sync'
echo '**********************';
forkdb -d /tmp/a heads yo
