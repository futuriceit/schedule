/*
 * Hacky: after re-scheduling a previous, failed request we'll reload the whole
 * list. While that AJAX call is in progress we want to prevent the user from
 * interacting with the UI, because we'll reload it when the call succeeds.
 * The SchedulingRequest itself doesn't keep track of the Submit→Error/Success
 * of a re-scheduling attempt; it notifies us and we hide the whole UI.
 * On Error we show an error, on Success we reload.
 */
var SchedulingRequestsList = React.createClass({
    mixins: [
        getRestLoaderMixin(apiRoot + 'schedulingrequests/?ordering=-requestedAt',
            'sReq', 'sReqLoaded', 'sReqErr'),
        getRestLoaderMixin(apiRoot + 'scheduletemplates/',
            'scheduleTemplates', 'scheduleTemplLoaded', 'scheduleTemplErr',
            function() {
                var scheduleTemplById = {};
                this.state.scheduleTemplates.forEach(function(s) {
                    scheduleTemplById[s.id] = s;
                });
                this.setState({
                    scheduleTemplById: scheduleTemplById
                });
            }),
        getRestLoaderMixin(apiRoot + 'users/?ordering=name',
            'users', 'usersLoaded', 'usersErr', function() {
                    var usersById = {};
                    this.state.users.forEach(function(u) {
                        usersById[u.id] = u;
                    });

                    var userTextById = {};
                    this.state.users.forEach(function(u) {
                        userTextById[u.id] = u.name + ' (' + u.email + ')';
                    });

                    var alphabeticalUserIds = Object.keys(userTextById);
                    alphabeticalUserIds.sort(function(a, b) {
                        a = userTextById[a].toLowerCase();
                        b = userTextById[b].toLowerCase();
                        if (a == b) {
                            return 0;
                        }
                        if (a < b) {
                            return -1;
                        }
                        return 1;
                    });

                    this.setState({
                        usersById: usersById,
                        userTextById: userTextById,
                        alphabeticalUserIds: alphabeticalUserIds
                    });
                })
    ],
    getInitialState: function() {
        return {
            sReq: null,
            sReqLoaded: false,
            sReqErr: '',

            scheduleTemplates: null,
            scheduleTemplLoaded: false,
            scheduleTemplErr: '',
            scheduleTemplById: null,

            users: null,
            usersLoaded: false,
            usersErr: '',
            usersById: null,
            userTextById: null,
            alphabeticalUserIds: null,

            // the ‘hacky’ re-schedule special case (see class docstring)
            reSchedFired: false,
            reSchedErr: false,
            reSchedErrMsg: ''
        };
    },

    rescheduleSubmit: function() {
        this.setState({
            reSchedFired: true
        });
    },
    rescheduleError: function(errMsg) {
        this.setState({
            reSchedErr: true,
            reSchedErrMsg: errMsg
        });
    },
    rescheduleSuccess: function() {
        window.location.reload(true);
    },

    render: function() {
        var err;
        ['sReqErr', 'scheduleTemplErr', 'usersErr'
        ].forEach((function(field) {
            err = err || this.state[field];
        }).bind(this));
        if (err) {
            return <div><span className="status-error">{err}</span></div>;
        }

        var loaded = true;
        ['sReqLoaded', 'scheduleTemplLoaded',
        'scheduleTemplById', 'usersLoaded', 'usersById'].forEach(
                (function(field) {
            loaded = loaded && Boolean(this.state[field]);
        }).bind(this));
        if (!loaded) {
            return <div><span className="status-waiting">Loading…</span></div>;
        }

        // the re-schedule special case
        if (this.state.reSchedFired) {
            if (this.state.reSchedErr) {
                return <div><span className="status-error">
                    {this.state.reSchedErrMsg}
                </span></div>;
            }
            return <div><span className="status-waiting">
                Making an identical scheduling request…
            </span></div>;
        }

        if (!this.state.sReq.length) {
            return <div>
                <span className="info">
                    There are no requests to make schedules.
                </span>
            </div>;
        }

        return <table className="striped">
            <thead>
                <tr>
                    <th>For Group</th>
                    <th>Template</th>
                    <th>By</th>
                    <th>Created</th>
                    <th>Add Users</th>
                    <th>Remove Users</th>
                    <th>Generate pdf</th>
                    <th>Status</th>
                    <th>Delete</th>
                </tr>
            </thead>
            <tbody>
                {this.state.sReq.map((function(r) {
                    return <SchedulingRequest
                            key={r.id}
                            model={r}
                            usersById={this.state.usersById}
                            userTextById={this.state.userTextById}
                            alphabeticalUserIds={this.state.alphabeticalUserIds}
                            scheduleTemplById={this.state.scheduleTemplById}
                            onRescheduleSubmit={this.rescheduleSubmit}
                            onRescheduleError={this.rescheduleError}
                            onRescheduleSuccess={this.rescheduleSuccess}
                        />;
                }).bind(this))}
            </tbody>
        </table>;
    }
});

/*
 * Hacky: when re-scheduling a failed request, this component notifies its
 * parent of Submit then Error or Success. But doesn't keep track itself of
 * this AJAX operation. In particular it doesn't disable the re-schedule
 * button.
 * See the SchedulingRequestsList docs for more details.
 */
var SchedulingRequest = React.createClass({
    propTypes: {
        model: React.PropTypes.object.isRequired,
        usersById: React.PropTypes.object.isRequired,
        userTextById: React.PropTypes.object.isRequired,
        alphabeticalUserIds: React.PropTypes.array.isRequired,
        scheduleTemplById: React.PropTypes.object.isRequired,
        onRescheduleSubmit: React.PropTypes.func.isRequired,
        // onRescheduleError(errorMessage)
        onRescheduleError: React.PropTypes.func.isRequired,
        onRescheduleSuccess: React.PropTypes.func.isRequired
    },
    getInitialState: function() {
        return {
            showDeleteBtn: true,
            showException: false,
            ajaxInFlight: '',
            ajaxErr: '',
            selectedUsers: [],
            selectedDeleteUsers: []
        };
    },
    delete: function() {
        var users = JSON.parse(this.props.model.json).users,
            msg = 'Delete ALL events from Google Calendar for \n' +
                enumSentence(users.map((function(uid) {
                    return getUserName(uid, this.props.usersById);
                }).bind(this))) + '?';
        if (confirm(msg)) {
            this.setState({
                ajaxInFlight: 'Deleting…'
            });
            $.ajax({
                url: '/scheduling-request/' +
                    this.props.model.id + '/',
                type: 'DELETE',
                headers: {'X-CSRFToken': $.cookie('csrftoken')},
                complete: (function(data) {
                    this.setState({
                        ajaxInFlight: ''
                    });
                }).bind(this),
                success: (function(data) {
                    this.setState({
                        ajaxErr: ''
                    });
                }).bind(this),
                error: (function(xhr, txtStatus, saveErr) {
                    this.setState({ajaxErr: getAjaxErr.apply(this, arguments)});
                }).bind(this)
            });
            this.setState({
                showDeleteBtn: false
            });
        }
    },
    toggleException: function(e) {
        e.preventDefault();
        this.setState({
            showException: !this.state.showException
        });
    },
    reSchedule: function() {
        var modelJson = JSON.parse(this.props.model.json),
            usersTxt = enumSentence(modelJson.users.map((function(uid) {
                return getUserName(uid, this.props.usersById);
            }).bind(this)));

        var templName = 'Unknown',
            templId = modelJson.scheduleTemplate;
        if (templId in this.props.scheduleTemplById) {
            templName = this.props.scheduleTemplById[templId].name;
        }

        var confirmMsg = 'Submit another Scheduling Request identical ' +
            'to this one?\n\n' +
            'Template: ' + templName + '\n' +
            'Users: ' + usersTxt;

        if (confirm(confirmMsg)) {
            this.props.onRescheduleSubmit();
            $.ajax({
                url: '/create-schedules/',
                type: 'POST',
                contentType: 'application/json; charset=UTF-8',
                headers: {'X-CSRFToken': $.cookie('csrftoken')},
                data: this.props.model.json,
                error: (function(xhr, txtStatus, saveErr) {
                    var errMsg = getAjaxErr.apply(this, arguments);
                    this.props.onRescheduleError(errMsg);
                }).bind(this),
                success: (function() {
                    this.props.onRescheduleSuccess();
                }).bind(this)
            });
        }
    },

    removeUser: function(id) {
        var selectedUsers = this.state.selectedUsers.filter(function(x) {
            return x.id != id;
        });
        var state = this.state;
        state.selectedUsers = selectedUsers;
        this.setState(state);

    },
    addUser: function(id) {
        var user = this.props.usersById[id];
        if (!user) {
            console.error('User with id', id, 'not found');
            return;
        }

        var selectedUsers = this.state.selectedUsers.filter(function(x) {
            return x.id != id;
        });
        selectedUsers.push(user);

        var state = this.state;
        state.selectedUsers = selectedUsers;
        this.setState(state);
    },

    removeDeleteUser: function(id) {
        var selectedDeleteUsers = this.state.selectedDeleteUsers.filter(function(x) {
            return x.id != id;
        });
        var state = this.state;
        state.selectedDeleteUsers = selectedDeleteUsers;
        this.setState(state);

    },
    addDeleteUser: function(id) {
        var user = this.props.usersById[id];
        if (!user) {
            console.error('User with id', id, 'not found');
            return;
        }

        var selectedDeleteUsers = this.state.selectedDeleteUsers.filter(function(x) {
            return x.id != id;
        });
        selectedDeleteUsers.push(user);

        var state = this.state;
        state.selectedDeleteUsers = selectedDeleteUsers;
        this.setState(state);
    },
    sendDeleteUsers: function(){
        $.ajax({
            url: '/remove-users-from-schedule/' + this.props.model.id +'/',
            type: 'POST',
            contentType: 'application/json; charset=UTF-8',
            headers: {'X-CSRFToken': $.cookie('csrftoken')},
            data: JSON.stringify({'users': this.state.selectedDeleteUsers}),
            success: (function(data) {
               this.setState({
                     ajaxErr: '',
                     selectedDeleteUsers: []
                    });
           }).bind(this),
           error: (function(xhr, txtStatus, saveErr) {
                    this.setState({ajaxErr: getAjaxErr.apply(this, arguments)});
           }).bind(this)
        })
    },

    sendUsers: function(){
        $.ajax({
            url: '/add-users-to-schedule/' + this.props.model.id +'/',
            type: 'POST',
            contentType: 'application/json; charset=UTF-8',
            headers: {'X-CSRFToken': $.cookie('csrftoken')},
            data: JSON.stringify({'users': this.state.selectedUsers}),
            success: (function(data) {
               this.setState({
                     ajaxErr: '',
                     selectedUsers: []
                    });
           }).bind(this),
           error: (function(xhr, txtStatus, saveErr) {
                    this.setState({ajaxErr: getAjaxErr.apply(this, arguments)});
           }).bind(this)
        })
    },

    generatePdf: function(){
        $.ajax({
            url: '/generate-pdf/' + this.props.model.id +'/',
            type: 'GET',
            headers: {'X-CSRFToken': $.cookie('csrftoken')},
            success: (function(data) {
                return;
           }).bind(this),
           error: (function(xhr, txtStatus, saveErr) {
                    this.setState({ajaxErr: getAjaxErr.apply(this, arguments)});
           }).bind(this)
        })
    },


    render: function() {
        var userName = getUserName(this.props.model.requestedBy,
                this.props.usersById),
            dateElem = <DateOnly
                date={new Date(this.props.model.requestedAt)}/>;
        var deleteBox;
        if (this.state.showDeleteBtn) {
            deleteBox = <div>
                    <button type="button" onClick={this.delete}>Delete</button>
                </div>;
        } else if (this.state.ajaxInFlight) {
            deleteBox = <div>
                <span className='status-waiting'>
                    {this.state.ajaxInFlight}
                </span>
            </div>;
        } else if (this.state.ajaxErr) {
            deleteBox = <div>
                <span className='status-error'>{this.state.ajaxErr}</span>
            </div>;
        } else {
            deleteBox = <div>
                <span className='info'>Deleted</span>
            </div>;
        }

        var addUsersBox =
            <div>
                 <MultiSelect
                    itemTextById={this.props.userTextById}
                    sortedIds={this.props.alphabeticalUserIds}
                    selectedIds={this.state.selectedUsers.map(
                        function(u) { return u.id; }
                    )}
                    onRemove={this.removeUser}
                    onAdd={this.addUser}
                    disabled={false}
                    />
                    <button type="button" onClick={this.sendUsers} disabled={this.state.selectedUsers.length == 0}>Add users</button>
            </div>
        var deleteUsersBox =
            <div>
                 <MultiSelect
                    itemTextById={this.props.userTextById}
                    sortedIds={this.props.alphabeticalUserIds}
                    selectedIds={this.state.selectedDeleteUsers.map(
                        function(u) { return u.id; }
                    )}
                    onRemove={this.removeDeleteUser}
                    onAdd={this.addDeleteUser}
                    disabled={false}
                    />
                    <button type="button" onClick={this.sendDeleteUsers} disabled={this.state.selectedDeleteUsers.length == 0}>Remove users</button>
            </div>

        var  generatePdfBox =
            <div>
                <button type="button" onClick={this.generatePdf}>generate</button>
                <br/>
                {
                    (this.props.model.pdfUrl) ? <a href={this.props.model.pdfUrl}>download</a> : null
                }
            </div>
        var status = this.props.model.status,
            modelJson = JSON.parse(this.props.model.json),
            link = <span>
                {enumSentence(modelJson.users.map((function(uid) {
                    return getUserName(uid, this.props.usersById);
                }).bind(this)))}
            </span>;
        if (status == 'SUCCESS' || status == 'ACTION_FAILED') {
            link = <a href={'../scheduling-request/' + this.props.model.id}>
                    {link}
                </a>;
        }

        var templName = 'Unknown',
            templId = modelJson.scheduleTemplate;
        if (templId in this.props.scheduleTemplById) {
            templName = this.props.scheduleTemplById[templId].name;
        }

        var statusElem = (function() {
            switch (status) {
                case 'SUCCESS':
                    return <span className='success'>{status}</span>;
                case 'ERROR':
                    return <div>
                        <a href="" onClick={this.toggleException}
                            title="Show error details">
                            <span className='error'>{status}</span>
                        </a>
                        <br/>
                        <button type="button" onClick={this.reSchedule}
                            title={"Submit another Scheduling Request " +
                                "identical to this one"}>
                            Re-Schedule…
                        </button>
                    </div>;
                case 'ACTION_FAILED':
                    return <div>
                        <a href="" onClick={this.toggleException}
                            title="Show error details">
                            <span className='error'>{status}</span>
                        </a>
                    </div>;
                default:
                    return <span className='info'>{status}</span>;
            }
        }).bind(this)();

        if (this.state.showException) {
            return <tr>
                <td colSpan="6">
                    <button type="button" onClick={this.toggleException}>
                        ←Back
                    </button>
                    <PreviewExpandBox text={this.props.model.error}/>
                </td>
            </tr>;
        }

        return <tr>
            <td>{link}</td>
            <td>{templName}</td>
            <td>{userName}</td>
            <td>{dateElem}</td>
            <td>{addUsersBox}</td>
            <td>{deleteUsersBox}</td>
            <td>{generatePdfBox}</td>
            <td className="sched-req-status">{statusElem}</td>
            <td>{deleteBox}</td>
        </tr>;
    }
});
