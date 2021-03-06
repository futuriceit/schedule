var ScheduleTemplateDetail = React.createClass({
    propTypes: {
        id: React.PropTypes.number.isRequired
    },
    mixins: [
        getRestLoaderMixin(apiRoot + 'timezones/?ordering=name', 'timezones',
            'tzLoaded', 'tzErr'),
        getRestLoaderMixin(apiRoot + 'calendars/?ordering=email', 'calendars',
            'calLoaded', 'calErr'),
        getRestLoaderMixin(apiRoot + 'users/?ordering=name',
            'users', 'usersLoaded', 'usersErr',
            function() {
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
            }),
        getRestLoaderMixin(apiRoot + 'calendarresources/', 'rooms',
            'roomsLoaded', 'roomsErr',
            function() {
                this.setState({
                    roomMSModel: makeRoomMultiSelectModel(this.state.rooms)
                });
            }),
    ],
    componentDidMount: function() {
        window.addEventListener('beforeunload', this.beforeUnloadHandler);

        compFetchRest.bind(this)(
            apiRoot + 'eventtemplates/' +
            '?scheduleTemplate=' + this.props.id +
            '&ordering=monthOffset,dayOffset,startTime',
            'evTempl', 'etLoaded', 'etErr',
            function() {
                // drop seconds. 11:00:00 → 11:00, 08:00:00 → 8:00
                var newEvTempl = this.state.evTempl.map(function(x) {
                    x = clone(x);
                    ['startTime', 'endTime'].forEach(function(fName) {
                        x[fName] = dropSeconds(x[fName]);
                    });
                    return x;
                });

                this.setState({
                    evTempl: newEvTempl,
                    editEvTempl: clone(newEvTempl),
                    evTemplExtra: newEvTempl.map((function() {
                        return this.newEvTExtraItem();
                    }).bind(this))
                });
            });

        compFetchItemRest.bind(this)(
            apiRoot + 'scheduletemplates/' + this.props.id,
            'schedTempl', 'schedTemplErr',
            function() {
                this.setState({
                    editSchedTempl: clone(this.state.schedTempl)
                });
            });
    },
    // A new item of ‘extra data’ for an event template. This goes into the
    // evTemplExtra array.
    newEvTExtraItem: function() {
        return {
            collapsed: true,
            ajaxErr: ''
        };
    },
    beforeUnloadHandler: function(ev) {
        if (this.hasUnsavedChanges()) {
            ev.returnValue = 'You have unsaved changes.';
        }
    },
    componentWillUnmount: function() {
        // we're not actually testing this, but be tidy and remove the handler
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    },
    getInitialState: function() {
        return {
            // Immutable models. These come from the server on initial load,
            // then on Create, Delete or Update operations.
            timezones: [],
            tzLoaded: false,
            tzErr: '',

            calendars: [],
            calLoaded: false,
            calErr: '',

            users: [],
            usersLoaded: false,
            usersErr: '',
            // Computed fields
            usersById: null,            // {id1: user-obj1, …}
            userTextById: null,         // {id1: 'name and email', …}
            alphabeticalUserIds: null,  // [id1, id2, …] ordered by user name

            rooms: [],
            roomsLoaded: false,
            roomsErr: '',
            // model for the MultiSelect
            roomMSModel: null,

            evTempl: [],
            etLoaded: false,
            etErr: '',

            schedTempl: null,
            schedTemplErr: '',

            // Mutable or ‘edit’ models. This is what the input fields change.
            // These start as a copy of the immutable models, and can be reset
            // back to them whenever we want.
            editSchedTempl: null,
            editEvTempl: null,
            // array with 1 item of ‘extra data’ (e.g. ajax error, collapsed)
            // per event template.
            evTemplExtra: null,

            ajaxInFlight: '',
            ajaxErr: '',

            newEventSummary: '',

            // default starting weekday for weekday computations: Monday
            startingWeekday: 1
        };
    },
    // returns boolean telling if we have unsaved edits in the page
    hasUnsavedChanges: function() {
        return !sameModels(this.state.editSchedTempl, this.state.schedTempl)
            || !sameModels(this.state.evTempl, this.state.editEvTempl);
    },
    createEventTemplate: function(ev) {
        ev.preventDefault();
        this.setState({
            ajaxInFlight: 'Creating…'
        });
        $.ajax({
            url: apiRoot + 'eventtemplates/',
            type: 'POST',
            contentType: 'application/json; charset=UTF-8',
            headers: {'X-CSRFToken': $.cookie('csrftoken')},
            data: JSON.stringify({
                scheduleTemplate: this.props.id,
                summary: this.state.newEventSummary,
                // some sensible values for the remaining required fields
                dayOffset: 0,
                monthOffset: 0,
                startTime: '10:00',
                endTime: '11:00',

                /* Django REST Framework complains ‘this field is required’
                 * if the following are missing. Making them ‘null=True’ in
                 * models.py solves this, but ‘manage.py migrate’ warns that
                 * ‘null=True’ has no effect on many-to-many fields.
                 * Looks like a rest framework limitation during validation,
                 * so adding the fields here as empty arrays.
                 */
                locations: [],
                otherInvitees: []
            }),
            complete: (function(data) {
                this.isMounted() && this.setState({
                    ajaxInFlight: ''
                });
            }).bind(this),
            success: (function(data) {
                ['startTime', 'endTime'].forEach(function(fName) {
                    data[fName] = dropSeconds(data[fName]);
                });

                var extraItem = this.newEvTExtraItem();
                extraItem.collapsed = false;
                this.setState({
                    ajaxErr: '',

                    newEventSummary: '',

                    evTempl: this.state.evTempl.concat(data),
                    editEvTempl: this.state.editEvTempl.concat(data),
                    evTemplExtra: clone(this.state.evTemplExtra).concat(extraItem)
                });
            }).bind(this),
            error: (function(xhr, txtStatus, saveErr) {
                this.setState({ajaxErr: getAjaxErr.apply(this, arguments)});
            }).bind(this)
        });
    },
    deleteEventTemplate: function(idx) {
        this.setState({
            ajaxInFlight: 'Deleting…'
        });
        $.ajax({
            url: apiRoot + 'eventtemplates/' + this.state.evTempl[idx].id + '/',
            type: 'DELETE',
            headers: {'X-CSRFToken': $.cookie('csrftoken')},
            complete: (function(data) {
                this.isMounted() && this.setState({
                    ajaxInFlight: ''
                });
            }).bind(this),
            success: (function() {
                var evTempl = this.state.evTempl.concat(),
                    editEvTempl = this.state.editEvTempl.concat(),
                    evTemplExtra = clone(this.state.evTemplExtra);
                [evTempl, editEvTempl, evTemplExtra].forEach(function(a) {
                    a.splice(idx, 1);
                });

                this.setState({
                    ajaxErr: '',

                    evTempl: evTempl,
                    editEvTempl: editEvTempl,
                    evTemplExtra: evTemplExtra
                });
            }).bind(this),
            error: (function(xhr, txtStatus, saveErr) {
                var errTxt = getAjaxErr.apply(this, arguments);
                var evTemplExtra = clone(this.state.evTemplExtra);
                evTemplExtra[idx].ajaxErr = errTxt;

                this.setState({
                    ajaxErr: errTxt,
                    evTemplExtra: evTemplExtra
                });
            }).bind(this)
        });
    },
    schedTemplFieldEdit: function(fieldName, newValue) {
        var editSchedTempl = clone(this.state.editSchedTempl);
        editSchedTempl[fieldName] = newValue;
        this.setState({
            editSchedTempl: editSchedTempl
        });
    },
    handleSchedTemplateChange: function(fieldName, convertToInt, ev) {
        var val = ev.target.value;
        if (convertToInt && typeof(val) == 'string') {
            val = parseInt(val, 10) || 0;
        }
        this.schedTemplFieldEdit(fieldName, val);
    },
    handleStartingWeekdayChange: function(ev) {
        this.setState({
            startingWeekday: parseInt(ev.target.value, 10)
        });
    },
    evTemplFieldEdit: function(idx, fieldName, newValue) {
        var editEvTempl = clone(this.state.editEvTempl);
        editEvTempl[idx][fieldName] = newValue;
        this.setState({
            editEvTempl: editEvTempl
        });
    },
    evTemplExtraFieldChanged: function(idx, fieldName, newValue) {
        var evTemplExtra = clone(this.state.evTemplExtra);
        evTemplExtra[idx][fieldName] = newValue;
        this.setState({
            evTemplExtra: evTemplExtra
        });
    },
    handleChangeNewEvent: function(ev) {
        this.setState({
            newEventSummary: ev.target.value
        });
    },
    undoChanges: function() {
        this.setState({
            editSchedTempl: clone(this.state.schedTempl),
            editEvTempl: clone(this.state.evTempl)
        });
    },
    confirmUndoChanges: function() {
        if (!confirm('Undo your changes?')) {
            return;
        }
        this.undoChanges();
    },
    saveAll: function() {
        // save the Schedule template, then each event template
        var eventTemplIndex;

        var saveSchedTemplate = (function() {
            this.setState({
                ajaxInFlight: 'Saving the Schedule Template…'
            });

            $.ajax({
                url: apiRoot + 'scheduletemplates/'
                    + this.state.editSchedTempl.id + '/',
                type: 'PUT',
                contentType: 'application/json; charset=UTF-8',
                headers: {'X-CSRFToken': $.cookie('csrftoken')},
                data: JSON.stringify(this.state.editSchedTempl),
                success: (function(data) {
                    this.setState({
                        ajaxErr: '',
                        schedTempl: clone(data),
                        editSchedTempl: clone(data)
                    });

                    eventTemplIndex = 0;
                    saveNextEventTemplate();
                }).bind(this),
                error: (function(xhr, txtStatus, saveErr) {
                    this.setState({
                        ajaxInFlight: '',
                        ajaxErr: getAjaxErr.apply(this, arguments)
                    })
                }).bind(this)
            });
        }).bind(this);

        var saveNextEventTemplate = (function () {
            if (eventTemplIndex == this.state.editEvTempl.length) {
                this.setState({
                    ajaxInFlight: ''
                });
                return;
            }
            this.setState({
                ajaxInFlight: 'Saving Event ' + (eventTemplIndex+1)
                    + ' of ' + this.state.editEvTempl.length
            });
            var evTemplExtra = clone(this.state.evTemplExtra);

            $.ajax({
                url: apiRoot + 'eventtemplates/'
                    + this.state.editEvTempl[eventTemplIndex].id + '/',
                type: 'PUT',
                contentType: 'application/json; charset=UTF-8',
                headers: {'X-CSRFToken': $.cookie('csrftoken')},
                data: JSON.stringify(this.state.editEvTempl[eventTemplIndex]),
                success: (function(data) {
                    ['startTime', 'endTime'].forEach(function(fName) {
                        data[fName] = dropSeconds(data[fName]);
                    });

                    evTemplExtra[eventTemplIndex].ajaxErr = '';

                    var evTempl = clone(this.state.evTempl);
                    evTempl[eventTemplIndex] = clone(data);

                    var editEvTempl = clone(this.state.editEvTempl);
                    editEvTempl[eventTemplIndex] = clone(data);

                    this.setState({
                        ajaxErr: '',
                        evTempl: evTempl,
                        editEvTempl: editEvTempl,
                        evTemplExtra: evTemplExtra
                    });

                    eventTemplIndex++;
                    saveNextEventTemplate();
                }).bind(this),
                error: (function(xhr, txtStatus, saveErr) {
                    var errTxt = getAjaxErr.apply(this, arguments);
                    evTemplExtra[eventTemplIndex].ajaxErr = errTxt;
                    this.setState({
                        ajaxInFlight: '',
                        ajaxErr: errTxt,
                        evTemplExtra: evTemplExtra
                    })
                }).bind(this)
            });
        }).bind(this);

        saveSchedTemplate();
    },
    render: function() {
        var v, i, fName;

        // check for error on initial load
        v = ['tzErr', 'calErr', 'usersErr', 'roomsErr', 'etErr',
          'schedTemplErr'];
        for (i = 0; i < v.length; i++) {
            fName = v[i];
            if (this.state[fName]) {
                return <div>
                    <span className="status-error">
                        {this.state[fName]}
                    </span>
                </div>;
            }
        }

        // check if initial loading completed
        v = ['tzLoaded', 'calLoaded', 'usersLoaded', 'roomsLoaded', 'etLoaded',
          'schedTempl',
          'usersById', 'userTextById', 'alphabeticalUserIds', 'roomMSModel',
          'editEvTempl', 'evTemplExtra', 'editSchedTempl'];
        for (i = 0; i < v.length; i++) {
            fName = v[i];
            if (!this.state[fName]) {
                return <div>
                    <span className="status-waiting">Loading…</span>
                </div>;
            }
        }

        // all loaded without errors

        var hasUnsavedChanges = this.hasUnsavedChanges();

        var makeSaveBox = (function() {
            var statusBox;
            if (this.state.ajaxInFlight || this.state.ajaxErr) {
                statusBox = <div>
                    <span className={'status-' +
                        (this.state.ajaxInFlight ? 'waiting' : 'error')}>
                        {this.state.ajaxInFlight || this.state.ajaxErr}
                    </span>
                </div>;
            }

            // avoid getting the deprecated React.addons.classSet() for now.
            var boxClassStr = ['schedule-template-status',
                hasUnsavedChanges ?
                'schedule-template-status-not-saved' :
                'schedule-template-status-saved'].join(' ');
            return <div className={boxClassStr}>
                <span className={hasUnsavedChanges ? 'warn' : 'info'}>
                    {hasUnsavedChanges ?
                        'There are unsaved changes' :
                        'You haven\'t made any changes'}
                </span>
                <br/>
                <button type="button"
                    disabled={this.state.ajaxInFlight ||
                        !hasUnsavedChanges}
                    onClick={this.saveAll}
                    >
                    Save all changes
                </button>
                <button type="button"
                    disabled={this.state.ajaxInFlight ||
                        !hasUnsavedChanges}
                    onClick={this.confirmUndoChanges}
                    >
                    Undo changes
                </button>

                {statusBox}
            </div>;
        }).bind(this);

        return <div>
            {makeSaveBox()}

            <div id="schedule-template-fields">
                <h1 className="no-margin">Schedule Template</h1>
                <table>
                <tbody>
                <tr>
                    <td>
                        <label>Name:</label>
                    </td>
                    <td>
                        <input type="text"
                            value={this.state.editSchedTempl.name}
                            disabled={Boolean(this.state.ajaxInFlight)}
                            onChange={this.handleSchedTemplateChange.bind(
                                    this, 'name', false)}
                        />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label>TimeZone:</label>
                    </td>
                    <td>
                        <select
                            value={this.state.editSchedTempl.timezone}
                            disabled={Boolean(this.state.ajaxInFlight)}
                            onChange={this.handleSchedTemplateChange.bind(
                                    this, 'timezone', true)}
                            >
                            {this.state.timezones.map(function(tz) {
                                return <option key={tz.id} value={tz.id}>
                                    {tz.name}
                                </option>;
                            })}
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label>Calendar:</label>
                    </td>
                    <td>
                        <select
                            value={this.state.editSchedTempl.calendar}
                            disabled={Boolean(this.state.ajaxInFlight)}
                            onChange={this.handleSchedTemplateChange.bind(
                                    this, 'calendar', true)}
                            >
                            {this.state.calendars.map(function(cal) {
                                return <option key={cal.id} value={cal.id}>
                                    {cal.email}
                                </option>;
                            })}
                        </select>
                    </td>
                </tr>
                </tbody>
                </table>
            </div>

            <section id="event-templates-container">
                <h1 className="no-margin">Event Templates</h1>
                <p>
                    Show weekdays for schedule starting on: {' '}
                    <select
                        value={this.state.startingWeekday}
                        disabled={Boolean(this.state.ajaxInFlight)}
                        onChange={this.handleStartingWeekdayChange}
                        >
                        {weekdayLongNames.map(function(name, idx) {
                            return <option key={idx} value={idx}>
                                {name}
                            </option>;
                        })}
                    </select>
                </p>
                {this.state.editEvTempl.length ? '' :
                    <span className="info">There are no event templates</span>}

                {(function() {
                    var result = [], lastDayOffset = null;
                    this.state.editEvTempl.forEach((function(et, i) {
                        if (et.dayOffset != lastDayOffset) {
                            lastDayOffset = et.dayOffset;
                            result.push(<h2 key={'daychange-'+et.id}
                                    className="no-margin">
                                        {(function() {
                                            if(et.monthOffset > 0) {
                                                var unit = Math.abs(et.monthOffset) == 1 ? 'month' : 'months';
                                                return ((et.monthOffset > 0 ? '+' : '') + et.monthOffset + ' ' + unit);
                                            } else {
                                                var dayOff = parseInt(et.dayOffset, 10) || 0,
                                                    norm = normalizeWeekdayIndex(dayOff + this.state.startingWeekday),
                                                    result = weekdayLongNames[norm],
                                                    wOff = weekOffset(dayOff);
                                                if (wOff != 0) {
                                                    var unit = Math.abs(wOff) == 1 ? 'week' : 'weeks';
                                                    result += ', ' + (wOff > 0 ? '+' : '') + wOff + ' ' + unit;
                                                }
                                                return result;
                                            }
                                        }).bind(this)()}
                            </h2>);
                        }
                        result.push(<EventTemplate
                            key={et.id}
                            model={et}
                            zeroWeekday={this.state.startingWeekday}
                            usersById={this.state.usersById}
                            userTextById={this.state.userTextById}
                            alphabeticalUserIds={this.state.alphabeticalUserIds}
                            roomMSModel={this.state.roomMSModel}
                            disabled={Boolean(this.state.ajaxInFlight)}
                            errTxt={this.state.evTemplExtra[i].ajaxErr}
                            onDelete={this.deleteEventTemplate.bind(
                                this, i)}
                            onFieldEdit={this.evTemplFieldEdit.bind(
                                this, i)}
                            collapsed={this.state.evTemplExtra[i].collapsed}
                            onCollapsedChanged={
                                this.evTemplExtraFieldChanged.bind(
                                    this, i, 'collapsed')}
                        />)
                    }).bind(this));
                    return result;
                }).bind(this)()}

                {
                    /*
                    Help the user save more often, and reduce confusion
                    about what's saved and what's not, by requiring
                    them to save their changes before adding a new
                    event template.
                    */
                }
                <form id="add-event-template"
                    onSubmit={this.createEventTemplate}>
                    {hasUnsavedChanges ?
                        <div><span className="info">
                            Please save your changes (or undo them)
                            before adding a new Event Template
                        </span></div>
                    : ''}
                    <label>Add an event template:</label> {' '}
                    <input type="text" placeholder="Event Summary…"
                        value={this.state.newEventSummary}
                        onChange={this.handleChangeNewEvent}
                        disabled={this.state.ajaxInFlight ||
                            hasUnsavedChanges} /> {' '}
                    <button type="submit"
                        disabled={this.state.ajaxInFlight ||
                            hasUnsavedChanges}>
                        + Add
                    </button>
                </form>
            </section>

            {makeSaveBox()}
        </div>;
    }
});


var EventTemplate = React.createClass({
    propTypes: {
        model: React.PropTypes.object.isRequired,

        usersById: React.PropTypes.object.isRequired,

        // needed by <MultiSelect/>
        userTextById: React.PropTypes.object.isRequired,
        alphabeticalUserIds: React.PropTypes.array.isRequired,

        roomMSModel: React.PropTypes.object.isRequired,
        // disable all input fields and buttons, e.g. during the parent's
        // ajax requests
        disabled: React.PropTypes.bool.isRequired,
        errTxt: React.PropTypes.string.isRequired,
        onDelete: React.PropTypes.func.isRequired,
        // onFieldEdit(fieldName, newValue)
        onFieldEdit: React.PropTypes.func.isRequired,

        collapsed: React.PropTypes.bool.isRequired,
        // onCollapsedChanged(newValue)
        onCollapsedChanged: React.PropTypes.func.isRequired,

        zeroWeekday: React.PropTypes.number.isRequired
    },
    toggleCollapsed: function() {
        this.props.onCollapsedChanged(!this.props.collapsed);
    },
    handleDelete: function() {
        if (!confirm('Delete ' + this.props.model.summary + '?')) {
            return;
        }
        this.props.onDelete();
    },
    handleChange: function(fieldName, convertToInt, ev) {
        var val = getTargetValue(ev);
        if (convertToInt && typeof(val) == 'string') {
            val = parseInt(val, 10) || 0;
        }
        this.props.onFieldEdit(fieldName, val);
    },
    handleIntBlur: function(fieldName, ev) {
        var val = parseInt(ev.target.value, 10) || 0;
        this.props.onFieldEdit(fieldName, val);
    },
    removeInvitee: function(removeId) {
        this.props.onFieldEdit('otherInvitees',
                this.props.model.otherInvitees.filter(function(id) {
                    return id != removeId;
                })
            );
    },
    addInvitee: function(addId) {
        for (var i = 0; i < this.props.model.otherInvitees.length; i++) {
            if (this.props.model.otherInvitees[i] == addId) {
                // person already invited
                return;
            }
        }
        if (!(addId in this.props.userTextById)) {
            console.error('No user with id', addId);
            return;
        }
        this.props.onFieldEdit('otherInvitees',
                this.props.model.otherInvitees.concat(addId));
    },
    removeRoom: function(removeId) {
        this.props.onFieldEdit('locations',
            this.props.model.locations.filter(function(id) {
                return id != removeId;
            })
        );
    },
    addRoom: function(addId) {
        this.props.onFieldEdit('locations',
            this.props.model.locations.filter(function(id) {
                return id != addId;
            }).concat(addId)
        );
    },
    shouldComponentUpdate: function(nextProps, nextState) {
        // {k1: whatever, k2: function, k3: whatever} →
        // {k1: whatever, k3: whatever}
        function stripFuncProps(obj) {
            var result = {};
            Object.keys(obj).forEach(function(k) {
                var v = obj[k];
                if (typeof(v) == 'function') {
                    return;
                }
                result[k] = v;
            });
            return result;
        }
        return !sameModels(nextState, this.state) ||
            !sameModels(stripFuncProps(nextProps), stripFuncProps(this.props));
    },
    render: function() {
        var errBox;
        if (this.props.errTxt) {
            errBox = <div>
                <span className="status-error">{this.props.errTxt}</span>
            </div>;
        }

        if (this.props.collapsed) {
            return <div className="event-template collapsed"
                    title="Click to Expand"
                    onClick={this.toggleCollapsed}>
                ▶ <strong>{this.props.model.summary}</strong>
                {!this.props.model.isCollective && ' [individual event]'}
                <br/>
                {this.props.model.dayOffset >= 0 && '+'}
                {this.props.model.dayOffset} days,{' '}
                {this.props.model.startTime} → {this.props.model.endTime}
                {' '}{this.props.model.locations.length ?
                    'in ' + enumSentence(this.props.model.locations.map((function(x) {
                        return this.props.roomMSModel.itemTextById[x];
                    }).bind(this))) :
                    <span className="info">no location</span>}
                <br/>
                {(function() {
                    var p = [];
                    if (this.props.model.inviteEmployees) {
                        p.push('employees');
                    }
                    if (this.props.model.inviteSupervisors) {
                        p.push('supervisors');
                    }
                    if (this.props.model.inviteFutubuddies) {
                        p.push('futubuddies');
                    }
                    this.props.model.otherInvitees.forEach((function(i) {
                        p.push(getUserName(i, this.props.usersById));
                    }).bind(this));

                    if (p.length) {
                        return 'Invite: ' + enumSentence(p) + '.';
                    }
                    return <span className="warn">Invite: Nobody</span>;
                }).bind(this)()}
                {errBox}
            </div>;
        }

        return <div className="event-template expanded">
            <span onClick={this.toggleCollapsed}
                className="collapse-symbol"
                title="Click to Collapse">
                ▼
            </span>
            <table className="event-template-fields">
            <tbody>
            <tr>
                <td><label>Summary:</label></td>
                <td>
                    <input type="text"
                        className="event-summary"
                        disabled={this.props.disabled}
                        value={this.props.model.summary}
                        onChange={this.handleChange.bind(
                                this, 'summary', false)}
                        />
                </td>
            </tr>

            <tr>
                <td><label>Description:</label></td>
                <td>
                    <textarea
                        className="event-description"
                        rows="3"
                        disabled={this.props.disabled}
                        value={this.props.model.description}
                        onChange={this.handleChange.bind(
                                this, 'description', false)}
                        />
                </td>
            </tr>

            <tr>
                <td><label>Event Type:</label></td>
                <td>
                    <select
                        disabled={this.props.disabled}
                        value={this.props.model.isCollective ? 'true' :
                            'false'}
                        onChange={this.handleChange.bind(this,
                                'isCollective', false)}
                        >
                        <option value='true'>
                            Common (invite all employees to the same event)
                        </option>
                        <option value='false'>
                            Individual (one separate event for each
                                    employee)
                        </option>
                    </select>
                </td>
            </tr>

            <tr>
                <td><label>Locations:</label></td>
                <td>
                    <MultiSelect
                        disabled={this.props.disabled}
                        itemTextById={this.props.roomMSModel.itemTextById}
                        sortedIds={this.props.roomMSModel.sortedIds}
                        selectedIds={this.props.model.locations}
                        onRemove={this.removeRoom}
                        onAdd={this.addRoom}
                    />
                </td>
            </tr>

            <tr>
                <td>
                    <abbr title={'How many calendar days ' +
                        'to add or subtract from the start date.\n' +
                        '0 = the start date\n' +
                        '1 = the day after the start date\n' +
                        '-7 = one week before the start date'}>
                        Day offset
                    </abbr>:
                </td>
                <td>
                    <input type="number"
                        disabled={this.props.disabled}
                        value={this.props.model.dayOffset}
                        onChange={this.handleChange.bind(
                                this, 'dayOffset', false)}
                        // If the user types 'hello' or '-' for '-3'
                        // only convert it to a number (0 for invalid
                        // strings) on blur
                        onBlur={this.handleIntBlur.bind(this, 'dayOffset')}
                        />
                    {' '} { this.props.model.monthOffset == 0 && weekdayLongNames[normalizeWeekdayIndex(
                        this.props.zeroWeekday +
                        (parseInt(this.props.model.dayOffset, 10) || 0)
                    )] }
                </td>
            </tr>

            <tr>
                <td>
                    <abbr title={'How many calendar months ' +
                        'to add or subtract from the start month.'}>
                        Month offset
                    </abbr>:
                </td>
                <td>
                    <input type="number"
                        disabled={this.props.disabled}
                        value={this.props.model.monthOffset}
                        onChange={this.handleChange.bind(
                                this, 'monthOffset', false)}
                        // If the user types 'hello' or '-' for '-3'
                        // only convert it to a number (0 for invalid
                        // strings) on blur
                        onBlur={this.handleIntBlur.bind(this, 'monthOffset')}
                        />
                    {' '}
                </td>
            </tr>

            <tr>
                <td><label>From:</label></td>
                <td>
                    <input type="time"
                        disabled={this.props.disabled}
                        value={this.props.model.startTime}
                        onChange={this.handleChange.bind(this, 'startTime', false)}
                        />
                    {' '} to {' '}
                    <input type="time"
                        disabled={this.props.disabled}
                        value={this.props.model.endTime}
                        onChange={this.handleChange.bind(this, 'endTime', false)}
                        />
                </td>
            </tr>

            <tr>
                <td>Participants:</td>
                <td>
                    <input type="checkbox"
                        disabled={this.props.disabled}
                        checked={this.props.model.inviteEmployees}
                        onChange={this.handleChange.bind(this,
                                'inviteEmployees', false)}
                        />
                        Invite employee{this.props.model.isCollective ?
                            's' : ''}
                </td>
            </tr>

            <tr>
                <td></td>
                <td>
                    <input type="checkbox"
                        disabled={this.props.disabled}
                        checked={this.props.model.inviteSupervisors}
                        onChange={this.handleChange.bind(this,
                                'inviteSupervisors', false)}
                        />
                        Invite supervisor{this.props.model.isCollective ?
                            's' : ''}
                </td>
            </tr>
            <tr>
                <td></td>
                <td>
                    <input type="checkbox"
                        disabled={this.props.disabled}
                        checked={this.props.model.inviteFutubuddies}
                        onChange={this.handleChange.bind(this,
                                'inviteFutubuddies', false)}
                        />
                        Invite {this.props.model.isCollective ?
                            'futubuddies' : 'futubuddy'}
                </td>
            </tr>
            <tr>
                <td><label>Other participants:</label></td>
                <td>
                    <MultiSelect
                        itemTextById={this.props.userTextById}
                        sortedIds={this.props.alphabeticalUserIds}
                        selectedIds={this.props.model.otherInvitees}
                        onRemove={this.removeInvitee}
                        onAdd={this.addInvitee}
                        disabled={this.props.disabled}
                        />
                </td>
            </tr>

            <tr>
                <td></td>
                <td>
                </td>
            </tr>
            </tbody>
            </table>

            <button type="button"
                onClick={this.handleDelete}
                disabled={this.props.disabled}
                >
                ✗ Delete
            </button>
            {errBox}
        </div>;
    }
});
