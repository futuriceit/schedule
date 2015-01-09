[![Build Status](https://travis-ci.org/futurice/schedule.svg?branch=master)](https://travis-ci.org/futurice/schedule)

# Create schedule templates and make Google Calendar Events from them

This file explains how to set up and run the project by hand.
See the `DEPLOY` file for a suggested way of doing this on a remote server.

For licensing (BSD 3-clause), see `COPYING`.

## Setup:
```bash
# Create settings.py for Django:
cd schedulesite/schedulesite
cp settings_dev.py.template settings.py
# Set the SECRET_KEY in settings.py to some random string.
cd -

bower install
npm install react-tools

# compile JSX files to plain JavaScript; JS files are copied unchanged
PATH=./node_modules/.bin:$PATH jsx --watch schedulesite/futuschedule/static/futuschedule/js/src schedulesite/futuschedule/static/futuschedule/js/build
```

Choose your Database by editing `settings.py`.
If you choose `PostgreSQL` then run `createdb futuschedule`.

Make a Python virtual environment however you prefer, then:
```bash
pip install -r req.txt
./schedulesite/manage.py migrate
```

You need a project in the Google Developers Console. Download its
`client-secrets.json` from there.

The first time the code needs Google OAuth, it looks for `client-secrets.json`
in your current directory, prints a URL for you to authorize the app and get
an access token in the URL fragment at the end.
Credentials are stored in `a_credentials_file` in your current dir.
Trigger this e.g. with:
```bash
./schedulesite/manage.py test futuschedule
```

### Populate your DB with FUM users
― Get a JSON dump of FUM users (you need an API token for FUM)
```bash
go run dump-fum-users.go -o users.json «AccessToken»
```
― Create Django users from this dump:
```bash
./schedulesite/manage.py shell
import futuschedule.util
futuschedule.util.updateUsers('users.json')
```

### Populate your DB with Meeting Rooms (you need the Google Admin password)
```bash
./schedulesite/manage.py shell
import futuschedule.util
futuschedule.util.updateMeetingRooms('google.admin@futurice.com', '«pass»')
```


## Running:

```bash
./schedulesite/manage.py migrate

# Start the webserver:
REMOTE_USER=myusername ./schedulesite/manage.py runserver

# Start the task-processor (kill with Ctrl+C (SIGINT) or SIGTERM):
./schedulesite/manage.py shell < task-processor.py
```
