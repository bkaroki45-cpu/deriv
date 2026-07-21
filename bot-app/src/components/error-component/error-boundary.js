import React from 'react';
import PropTypes from 'prop-types';
import ErrorComponent from './index';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    componentDidCatch = (error, info) => {
        if (window.TrackJS) window.TrackJS.console.log(this.props.root_store);

        // Keep the production recovery screen useful. The upstream template
        // discarded the exception, which made a real configuration or loading
        // failure indistinguishable from a temporary interruption.
        console.error('Profitera Bot startup error:', error, info);

        this.setState({
            hasError: true,
            error,
            info,
        });
    };
    render = () =>
        this.state.hasError ? (
            <ErrorComponent
                should_show_refresh={true}
                header='Profitera Bot could not start'
                message={this.state.error?.message || 'Please refresh the page. If this continues, send this message to support.'}
            />
        ) : (
            this.props.children
        );
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;
